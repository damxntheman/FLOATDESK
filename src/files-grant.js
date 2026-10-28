import { AppAccessGrant } from './app-access.js';

// Files permission is entirely separate from mouse, apps and Terminal.
// Mac owner must first acknowledge the request and then select a specific
// folder in a native picker; browsing starts only when BOTH have happened.
export class FilesGrant extends AppAccessGrant {
  constructor(clock = () => Date.now()) {
    super(clock, { requestMs:30000, grantMs:5 * 60 * 1000, actionIntervalMs:80 });
    this.selectionMs = 90000;
  }
  beginSelection() {
    if (this.phase !== 'requested' ||
        this.clock() - this.requestedAt > this.requestMs) {
      this.revoke();
      throw new Error('Files request expired; request again.');
    }
    this.phase='selecting';
    this.requestedAt=this.clock();
  }
  approveWithSelection(selected) {
    if (this.phase !== 'selecting' || this.expired()) {
      this.revoke();
      throw new Error('Mac folder selection has expired.');
    }
    if (!selected || typeof selected.root !== 'string' ||
        typeof selected.label !== 'string') {
      throw new Error('Mac must choose a folder first.');
    }
    this.phase='active';
    this.until=this.clock()+this.grantMs;
  }
  expired() {
    return super.expired() ||
      (this.phase === 'selecting' && this.clock() - this.requestedAt > this.selectionMs);
  }
}
