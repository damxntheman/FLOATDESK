// Mac-first M3 application catalog: a deliberately narrow and auditable bridge.
// No arbitrary paths or shell commands are accepted from a phone.
import { createHash } from 'node:crypto';
import { readdirSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCallback);
export const defaultRoots = (home = homedir()) => [
  '/Applications', '/System/Applications', '/System/Applications/Utilities',
  join(home, 'Applications')
];

function catalogId(path) {
  return createHash('sha256').update(path).digest('hex').slice(0, 24);
}
export function discoverMacApps({
  platform = process.platform,
  roots = defaultRoots(),
  includeFinder = true
} = {}) {
  if (platform !== 'darwin') return [];
  const apps = [];
  const seen = new Set();
  for (const root of roots) {
    let contents;
    try { contents = readdirSync(root, { withFileTypes: true }); }
    catch { continue; } // absent/not granted; never traverse arbitrary paths
    for (const entry of contents) {
      if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue;
      const name = entry.name.slice(0, -4);
      if (!name || name.length > 90 || name.startsWith('.') ||
          /[\u0000-\u001f\u007f]/u.test(name)) continue;
      const path = resolve(root, entry.name);
      try {
        // Reject symlink app entries, preventing a catalog entry from escaping
        // known application folders. No recursive scanning.
        if (!lstatSync(path).isDirectory()) continue;
      } catch { continue; }
      if (seen.has(path)) continue;
      seen.add(path);
      apps.push({ id: catalogId(path), name, path });
    }
  }
  // Finder is a protected first-party app bundle outside /Applications.
  // Add only this known path; do not enumerate all CoreServices helpers.
  const finderPath = '/System/Library/CoreServices/Finder.app';
  if (includeFinder && !seen.has(finderPath)) {
    try {
      if (lstatSync(finderPath).isDirectory()) {
        apps.push({ id: catalogId(finderPath), name: 'Finder', path: finderPath });
      }
    } catch {}
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name, 'en') ||
    a.id.localeCompare(b.id)).slice(0, 120);
}

export function publicCatalog(apps) {
  return apps.map(({ id, name }) => ({ id, name }));
}

export async function launchCatalogApp(id, {
  platform = process.platform,
  apps = discoverMacApps(),
  executor = execFileAsync
} = {}) {
  if (platform !== 'darwin') throw new Error('iPhone Mode requires a Mac host.');
  if (typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) {
    throw new Error('Invalid app identifier.');
  }
  const app = apps.find((entry) => entry.id === id);
  if (!app) throw new Error('This application is no longer available on the Mac.');
  // No shell, no viewer-provided path/args. macOS Launch Services handles
  // opening the app and any standard foreground activation behavior.
  await executor('/usr/bin/open', ['-a', app.path], { timeout: 8000, windowsHide: true });
  return { id: app.id, name: app.name };
}
