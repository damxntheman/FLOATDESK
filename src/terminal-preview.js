import { arch as osArch, release as osRelease, uptime as osUptime } from 'node:os';

/**
 * M4 "Terminal Preview" is intentionally NOT a PTY or shell.
 * It demonstrates interactive phone-native presentation with actual, safe
 * Mac diagnostics. A real shell requires a separate design and device gate.
 */
const HELP = Object.freeze(['help', 'date', 'uptime', 'system']);
export const TERMINAL_PREVIEW_COMMANDS = HELP;

export function runTerminalPreview(command, {
  platform = process.platform,
  now = () => new Date(),
  uptime = osUptime,
  arch = osArch,
  release = osRelease
} = {}) {
  if (platform !== 'darwin') throw new Error('Mac Terminal Preview is available only from a Mac host.');
  if (typeof command !== 'string' || command.length > 32 ||
      !/^[a-z]+$/.test(command)) {
    throw new Error('Unsupported command. Type help for supported commands.');
  }
  const lines = (() => {
    switch (command) {
      case 'help':
        return [
          'FLOATDESK Terminal Preview — read-only Mac diagnostics',
          'Allowed commands: ' + HELP.join(', '),
          'No interactive shell, files, programs or scripts can run.'
        ];
      case 'date':
        return [now().toISOString()];
      case 'uptime': {
        const seconds = Math.max(0, Math.floor(uptime()));
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor(seconds % 86400 / 3600);
        const mins = Math.floor(seconds % 3600 / 60);
        return ['Mac uptime: ' + days + 'd ' + hours + 'h ' + mins + 'm'];
      }
      case 'system':
        return ['macOS / Darwin · ' + arch() + ' · kernel ' + release()];
      default:
        throw new Error('Unsupported command. Type help for supported commands.');
    }
  })();
  // Bound output size and remove control characters before sending over WS.
  return lines.map(line => String(line).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200)).slice(0, 8);
}
