// Independent owner-approved capability for M3 phone-native app actions.
// A pairing alone never authorizes listing or launching applications.
export class AppAccessGrant {
  constructor(clock = () => Date.now(), {
    requestMs = 30000, grantMs = 5 * 60 * 1000, actionIntervalMs = 1500
  } = {}) {
    this.clock = clock;
    this.requestMs = requestMs;
    this.grantMs = grantMs;
    this.actionIntervalMs = actionIntervalMs;
    this.revoke();
  }
  revoke() {
    this.phase = 'off';
    this.requestedAt = null;
    this.until = null;
    this.lastActionAt = null;
  }
  request() {
    if (this.phase !== 'off') throw new Error('App access is already requested or active.');
    this.phase = 'requested';
    this.requestedAt = this.clock();
  }
  approve() {
    if (this.phase !== 'requested' ||
        this.clock() - this.requestedAt > this.requestMs) {
      this.revoke();
      throw new Error('App access request expired. Request again.');
    }
    this.phase = 'active';
    this.until = this.clock() + this.grantMs;
  }
  expired() {
    return (this.phase === 'requested' &&
      this.clock() - this.requestedAt > this.requestMs) ||
      (this.phase === 'active' && this.clock() >= this.until);
  }
  check() {
    if (this.phase !== 'active' || this.expired()) {
      throw new Error('Mac app access is not approved or has expired.');
    }
  }
  useAction() {
    this.check();
    const now = this.clock();
    if (this.lastActionAt !== null &&
        now - this.lastActionAt < this.actionIntervalMs) {
      throw new Error('Please wait before opening another application.');
    }
    this.lastActionAt = now;
  }
}
