import { AppAccessGrant } from './app-access.js';

// Files permission is entirely separate from M2 mouse, M3 apps and M4 Terminal.
// Listing is read-only metadata of exactly one selected root per grant.
export class FilesGrant extends AppAccessGrant {
  constructor(clock = () => Date.now()) {
    super(clock, { requestMs:30000, grantMs:5 * 60 * 1000, actionIntervalMs:80 });
  }
  // Mac owner's selection is required before approval becomes active.
  approveWithSelection(selected) {
    if (!selected || typeof selected.root !== 'string' ||
        typeof selected.label !== 'string') {
      throw new Error('Mac must choose a folder first.');
    }
    super.approve();
  }
}
