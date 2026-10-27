import { AppAccessGrant } from './app-access.js';

// Separate from app listing/launching and from M2 touch permissions.
// A confirmed Mac grant allows ONLY approved diagnostic commands.
export class TerminalPreviewGrant extends AppAccessGrant {
  constructor(clock = () => Date.now()) {
    super(clock, { requestMs: 30000, grantMs: 180000, actionIntervalMs: 300 });
  }
}
