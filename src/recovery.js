/**
 * A room-scoped cooldown prevents repeated video renegotiations from
 * disrupting an otherwise healthy live/PiP stream.
 */
export class RecoveryThrottle {
  constructor(cooldownMs = 5000, clock = () => Date.now()) {
    if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
      throw new RangeError('Invalid cooldown.');
    }
    this.cooldownMs = cooldownMs;
    this.clock = clock;
    this.last = new WeakMap();
  }

  permit(room) {
    if (!room || typeof room !== 'object') return false;
    const now = this.clock();
    const previous = this.last.get(room);
    if (previous !== undefined && now - previous < this.cooldownMs) return false;
    this.last.set(room, now);
    return true;
  }
}
