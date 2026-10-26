# Architecture and non-goals

## Product vision

FLOATDESK proposes a phone-first remote desktop experience. The core interactions are full-view direct touch, floating view-only PiP when the phone is used for other tasks, and return to an authenticated session without an unnecessary second login.

## Current experimental vertical slice

```text
Desktop browser (explicit getDisplayMedia consent)
        | WebRTC encrypted media, no relay
        v
Mobile/desktop browser (video playback, optional browser PiP)
        ^
        | WSS signaling: create / join / resume / offer / answer / ICE
        v
Node.js signaling server (no media storage)
```

Signaling state is held in memory. Sessions last up to one hour, join codes ten minutes. A reconnect authenticates with a per-role random capability in the browser tab's session storage. It is not equivalent to keeping the capture pipeline running across OS suspension.

### Distinct states (future native model)

1. **Authorization:** unpaired → approval pending → paired → revoked.
2. **Host capture:** idle → permission requested → capturing → interrupted → stopped.
3. **Transport:** disconnected → negotiating → connected → degraded/reconnecting → closed.
4. **Presentation:** full touch view ↔ floating watch-only PiP; session-ended.
5. **Security:** permitted ↔ lock/sensitive content detected → block/stop.

Never claim `live` merely because signaling credentials still exist. Display media/transport health must be independently verified. Capture revocation requires renewed consent; it is not a simple network reconnect.

## MVP boundaries

- Native iOS/Android PiP still needs device feasibility proof.
- Native desktop host agent for macOS and Windows still needs design, OS permissions, signing, and validation.
- Real input control is **not** implemented. It will require an explicit host-side control grant, per-session audit trail, escape mechanism, and secure touch-to-pointer mapping.
- A true mobile experience should favor low-bitrate stream while minimized; browser throttling and iOS background process behavior are not guaranteed.
- External remote access, unattended control, TURN/relay, file transfer, audio capture, unattended persistence, and multi-monitor are outside the first vertical slice.

## Proposed future protocol

Prefer established, audited media libraries and transports over rolling custom cryptography. The host and viewer should mutually authenticate pairing identity and establish an encrypted media/data channel. Input messages must carry authorized capability, session ID, replay protection, and bounded event frequency. All permissions should be revocable at the host.

## Deployment warning

The current Node server is a research harness, **not** a remote desktop daemon. Browser `getDisplayMedia` mandates interactive consent and cannot grant unattended capture. The prototype has no authorization for OS input injection and must never attempt hidden persistence.
