/**
 * Declarative M4 app-experience routing.
 * The *Mac* is authoritative; client hints are never privileges.
 * Applications that do not have a verified adapter keep Desktop Mode fallback.
 */
export const APP_EXPERIENCE_VERSION = 1;
const TERMINAL_APP_PATH = '/System/Applications/Utilities/Terminal.app';
const FINDER_APP_PATH = '/System/Library/CoreServices/Finder.app';

export function experienceFor(app) {
  if (app?.path === TERMINAL_APP_PATH && app?.name === 'Terminal') {
    return {
      type: 'mobile-terminal-preview',
      title: 'Terminal',
      description: 'A phone-friendly, read-only Mac diagnostics terminal.',
      requires: 'separate-terminal-approval',
      isFullShell: false,
      desktopFallback: true
    };
  }
  if (app?.path === FINDER_APP_PATH && app?.name === 'Finder') {
    return {
      type: 'mobile-files',
      title: 'Files',
      description: 'Browse names of files in a folder selected by the Mac owner.',
      requires: 'separate-files-approval',
      isFullShell: false,
      desktopFallback: true
    };
  }
  return {
    type: 'desktop-launch',
    title: typeof app?.name === 'string' ? app.name : 'Application',
    description: 'Open the real application on the Mac.',
    requires: 'app-access',
    isFullShell: false,
    desktopFallback: true
  };
}

export function publicExperience(app) {
  const mode = experienceFor(app);
  // Do not send local paths, executable arguments or any capability tokens.
  return { id: app.id, name: app.name, experience: mode.type };
}
