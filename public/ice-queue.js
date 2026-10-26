/**
 * A small, bounded ICE-candidate buffer.
 * ICE trickle events can arrive before the SDP offer/answer because
 * RTCPeerConnection begins candidate gathering during setLocalDescription.
 */
export class CandidateBuffer {
  constructor(maxNegotiations = 4, maxCandidates = 128) {
    this.queues = new Map();
    this.maxNegotiations = maxNegotiations;
    this.maxCandidates = maxCandidates;
  }

  queue(id, candidate) {
    if (typeof id !== 'string' || !id || id.length > 64 || !candidate) return false;
    if (!this.queues.has(id)) {
      if (this.queues.size >= this.maxNegotiations) {
        this.queues.delete(this.queues.keys().next().value);
      }
      this.queues.set(id, []);
    }
    const list = this.queues.get(id);
    if (list.length >= this.maxCandidates) return false;
    list.push(candidate);
    return true;
  }

  take(id) {
    const candidates = this.queues.get(id) || [];
    this.queues.delete(id);
    return candidates;
  }

  retain(id) {
    if (!id) { this.queues.clear(); return; }
    const candidates = this.queues.get(id);
    this.queues.clear();
    if (candidates) this.queues.set(id, candidates);
  }
}
