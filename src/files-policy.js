/**
 * M4 Files Mode groundwork: safe metadata-only, read-only directory enumeration.
 * Not network exposed. A future NATIVE Mac owner folder picker must supply root.
 * Never interpret a phone-supplied absolute path, expand tilde, read contents,
 * follow symlinks, or allow traversing outside the explicitly selected folder.
 */
import { readdirSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, sep, join } from 'node:path';

const MAX_DEPTH = 12;
const MAX_ITEMS = 100;
const MAX_NAME = 160;

export function validateRelativeFolder(relative) {
  if (relative === '' || relative === '.') return [];
  if (typeof relative !== 'string' || relative.length > 1000 ||
      relative.startsWith('/') || relative.includes('\\') ||
      relative.includes('\0')) throw new Error('Invalid folder.');
  const parts = relative.split('/');
  if (parts.length > MAX_DEPTH || parts.some(part =>
    !part || part === '.' || part === '..' || part.startsWith('.') ||
    part.length > MAX_NAME || /[\u0000-\u001f\u007f]/u.test(part))) {
    throw new Error('Invalid folder.');
  }
  return parts;
}

function contained(root, candidate) {
  return candidate === root || candidate.startsWith(root.endsWith(sep) ? root : root + sep);
}

export function listSafeMetadata(root, relative = '.', {
  fs = { readdirSync, realpathSync, lstatSync }
} = {}) {
  if (typeof root !== 'string' || !root.startsWith('/')) {
    throw new Error('Only an owner-selected absolute Mac folder is allowed.');
  }
  const segments = validateRelativeFolder(relative);
  const rootReal = fs.realpathSync(root);
  if (!fs.lstatSync(rootReal).isDirectory()) throw new Error('Selected root is not a folder.');
  const candidate = resolve(rootReal, ...segments);
  if (!contained(rootReal, candidate)) throw new Error('Folder is outside the selected root.');
  // Do not follow a symlink even when it points *back inside* the allowed root.
  let walk = rootReal;
  for (const part of segments) {
    walk = join(walk, part);
    if (fs.lstatSync(walk).isSymbolicLink()) throw new Error('Symlink folders are not supported.');
  }
  const candidateReal = fs.realpathSync(candidate);
  if (!contained(rootReal, candidateReal)) throw new Error('Folder escapes the selected root.');
  if (!fs.lstatSync(candidateReal).isDirectory()) throw new Error('Not a folder.');
  const entries = [];
  for (const entry of fs.readdirSync(candidateReal, { withFileTypes:true })) {
    if (entry.name.startsWith('.') || entry.name.length > MAX_NAME ||
        /[\u0000-\u001f\u007f]/u.test(entry.name) ||
        entry.isSymbolicLink()) continue;
    if (!entry.isDirectory() && !entry.isFile()) continue;
    // Expose ONLY safe display metadata; never file bodies or executable paths.
    entries.push({ name:entry.name, kind:entry.isDirectory() ? 'folder' : 'file' });
    if (entries.length >= MAX_ITEMS) break;
  }
  entries.sort((a,b)=>a.kind === b.kind ?
    a.name.localeCompare(b.name,'en') : a.kind === 'folder' ? -1 : 1);
  return { folder:segments.join('/'), entries, truncated:entries.length >= MAX_ITEMS };
}
