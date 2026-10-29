import { randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LIFETIME = 10 * 60 * 1000;
const SESSION_LIFETIME = 60 * 60 * 1000;

export function generateCode() {
  const bytes = randomBytes(8);
  return [...bytes].map((value) => ALPHABET[value & 31]).join('');
}

function makeToken() {
  return randomBytes(32).toString('base64url');
}

function tokenMatches(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class SessionRegistry {
  constructor(clock = () => Date.now(), { onRemove = () => {} } = {}) {
    this.clock = clock;
    this.onRemove = onRemove;
    this.removing = new WeakSet();
    this.rooms = new Map();
    this.clients = new Map();
  }

  prune() {
    const now = this.clock();
    for (const record of this.rooms.values()) {
      if (now >= record.expiresAt) this.remove(record, 'expired');
    }
  }

  create(client) {
    this.prune();
    if (this.clients.has(client)) throw new Error('This connection already belongs to a session.');
    let code;
    do { code = generateCode(); } while (this.rooms.has(code));
    const now = this.clock();
    const record = {
      code, host: client, viewer: null,
      hostToken: makeToken(), viewerToken: null,
      joinUntil: now + CODE_LIFETIME,
      expiresAt: now + SESSION_LIFETIME
    };
    this.rooms.set(code, record);
    this.clients.set(client, { record, role: 'host' });
    return { code, token: record.hostToken, joinUntil: record.joinUntil, expiresAt: record.expiresAt };
  }

  join(client, candidate) {
    this.prune();
    if (this.clients.has(client)) throw new Error('This connection already belongs to a session.');
    const code = String(candidate || '').toUpperCase().trim();
    const record = this.rooms.get(code);
    if (!record || this.clock() >= record.joinUntil) throw new Error('Invalid or expired pairing code.');
    if (record.viewerToken) throw new Error('Session already paired. Reconnect with your saved session.');
    record.viewer = client;
    record.viewerToken = makeToken();
    this.clients.set(client, { record, role: 'viewer' });
    return { code, token: record.viewerToken, expiresAt: record.expiresAt, host: record.host };
  }

  resume(client, code, role, token) {
    this.prune();
    if (this.clients.has(client)) throw new Error('This connection already belongs to a session.');
    const record = this.rooms.get(String(code || '').toUpperCase());
    if (!record || !['host', 'viewer'].includes(role)) throw new Error('Session unavailable.');
    const expected = role === 'host' ? record.hostToken : record.viewerToken;
    if (!tokenMatches(expected, token)) throw new Error('Session authentication failed.');
    const previous = record[role];
    if (previous) this.clients.delete(previous);
    record[role] = client;
    this.clients.set(client, { record, role });
    return { record, previous };
  }

  forClient(client) {
    this.prune();
    return this.clients.get(client) || null;
  }

  peer(client) {
    const entry = this.forClient(client);
    if (!entry) return null;
    return entry.role === 'host' ? entry.record.viewer : entry.record.host;
  }

  detach(client) {
    const entry = this.clients.get(client);
    if (!entry) return null;
    this.clients.delete(client);
    if (entry.record[entry.role] === client) entry.record[entry.role] = null;
    return entry;
  }

  stop(client) {
    const entry = this.clients.get(client);
    if (!entry || entry.role !== 'host') throw new Error('Only the host can end a session.');
    this.remove(entry.record);
    return entry.record;
  }

  remove(record, reason = 'ended') {
    if (this.rooms.get(record.code) !== record || this.removing.has(record)) return;
    this.removing.add(record);
    try {
      // Expiry can be observed by ANY lookup, including async native replies.
      // Dispose grants/processes and notify peers before losing room context.
      this.onRemove(record, reason);
    } finally {
      if (record.host) this.clients.delete(record.host);
      if (record.viewer) this.clients.delete(record.viewer);
      this.rooms.delete(record.code);
      this.removing.delete(record);
    }
  }
}
