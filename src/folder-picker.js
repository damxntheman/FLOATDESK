import { existsSync, realpathSync, lstatSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename } from 'node:path';

// A local Mac GUI picker is the ONLY source of Files Mode's root directory.
// No phone-supplied paths, predefined home-folder grants, or browser path inputs.
export function verifyPickedRoot(path, {
  realpath = realpathSync,
  lstat = lstatSync
} = {}) {
  if (typeof path !== 'string' || path.length < 2 || path.length > 2048 ||
      !path.startsWith('/') || path.includes('\0') || path.includes('\n')) {
    throw new Error('Mac folder selection was invalid.');
  }
  const real = realpath(path);
  if (real === '/' || real === '/System' || real === '/private' ||
      real === '/Library' || real === '/Users' || !lstat(real).isDirectory()) {
    throw new Error('Select a specific folder, not a system-wide root.');
  }
  return { root: real, label: basename(real) || 'Selected folder' };
}

export function openMacFolderPicker({
  platform = process.platform,
  binary = process.env.FLOATDESK_FOLDER_PICKER_BIN || '',
  spawnProcess = spawn,
  exists = existsSync,
  timeoutMs = 90000,
  verify = verifyPickedRoot
} = {}) {
  if (platform !== 'darwin' || !binary || !exists(binary)) {
    throw new Error('Mac folder picker is not configured.');
  }
  const child = spawnProcess(binary, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  let settled = false;
  let output = '';
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  let timer;
  function settle(error, value) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) rejectPromise(error);
    else resolvePromise(value);
  }
  timer = setTimeout(() => {
    child.kill();
    settle(new Error('Folder selection timed out.'));
  }, timeoutMs);
  timer.unref?.();
  // The helper's JSON is only consumed locally. Never log folder paths.
  child.stdout.on('data', chunk => {
    output += String(chunk);
    if (output.length > 4096) {
      child.kill();
      settle(new Error('Invalid folder picker output.'));
    }
  });
  child.stderr.on('data', () => {}); // drain without disclosing local paths
  child.on('error', () => settle(new Error('Could not open Mac folder picker.')));
  child.on('exit', code => {
    if (settled) return;
    if (code !== 0) return settle(new Error('Mac folder picker exited unexpectedly.'));
    try {
      const lines = output.trim().split('\n');
      if (lines.length !== 1) throw new Error('Invalid folder picker response.');
      const response = JSON.parse(lines[0]);
      if (response?.type === 'cancelled') {
        return settle(new Error('Folder selection cancelled.'));
      }
      if (response?.type !== 'chosen' || typeof response.path !== 'string') {
        throw new Error('Invalid folder picker response.');
      }
      settle(null, verify(response.path));
    } catch (error) {
      settle(error instanceof Error ? error : new Error('Folder selection failed.'));
    }
  });
  return {
    promise,
    cancel() {
      if (settled) return;
      child.kill();
      settle(new Error('Folder selection cancelled.'));
    }
  };
}
