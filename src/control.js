// In-memory, per-pairing, expiring remote-click capability.
// No approval survives a process restart or detached WebSocket.
export class ControlGrant {
  constructor(now = () => Date.now(), { requestMs = 30000, grantMs = 120000, minClickMs = 120 } = {}) {
    this.now = now;
    this.requestMs = requestMs;
    this.grantMs = grantMs;
    this.minClickMs = minClickMs;
    this.revoke();
  }
  revoke() {
    this.phase = 'off';
    this.requestedAt = null;
    this.until = null;
    this.lastClickAt = null;
  }
  request() {
    if (this.phase !== 'off') throw new Error('Control request already pending or active.');
    this.phase = 'requested';
    this.requestedAt = this.now();
  }
  approve() {
    if (this.phase !== 'requested' || this.now() - this.requestedAt > this.requestMs) {
      this.revoke();
      throw new Error('Control request expired. Request again.');
    }
    this.phase = 'starting';
  }
  activate() {
    if (this.phase !== 'starting') throw new Error('Control approval was not requested.');
    this.phase = 'active';
    this.until = this.now() + this.grantMs;
  }
  expired() {
    return this.phase === 'active' && this.now() >= this.until ||
      this.phase === 'requested' && this.now() - this.requestedAt > this.requestMs;
  }
  click(x, y) {
    if (this.phase !== 'active' || this.expired()) throw new Error('Control is not authorized or has expired.');
    if (typeof x !== 'number' || typeof y !== 'number' ||
        !Number.isFinite(x) || !Number.isFinite(y) ||
        x < 0 || x > 1 || y < 0 || y > 1) {
      throw new Error('Invalid normalized touch coordinates.');
    }
    if (this.lastClickAt !== null && this.now() - this.lastClickAt < this.minClickMs) {
      throw new Error('Touch rate limit exceeded.');
    }
    this.lastClickAt = this.now();
    return { type: 'click', x, y };
  }
}
