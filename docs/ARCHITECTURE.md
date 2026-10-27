# Architecture and non-goals

## M4: App Experience Engine (non-universal adapters)

A pure server-side app resolver recognizes ONLY the canonical built-in macOS Terminal bundle at `/System/Applications/Utilities/Terminal.app`. Public app catalog entries include an `experience` hint (`mobile-terminal-preview` or `desktop-launch`). That hint controls UI routing, **never grants authorization**; the Mac server independently enforces all operation permissions.

The first phone-native adapter, **Terminal Preview**, intentionally does **not** spawn a shell, open a PTY, attach to Terminal.app windows or run arbitrary Mac commands. It exposes only allowlisted, read-only system diagnostics. A separate `TerminalPreviewGrant` per pairing requires the phone's `terminal-request`, then Mac-local `terminal-approve` within 30 seconds, lasts 3 minutes, rate-limits queries, and revokes on either-device request, disconnect, session end or expiry. Existing application launch and remote-click capabilities are independent.

`src/files-policy.js` prepares an isolated read-only **directory metadata listing** API for a future owner-selected root; it rejects traversal, hidden paths, symlinks and absolute phone paths. It is currently **not imported by the server**. No browser message can invoke it or read arbitrary Mac directories. Do not expose Files until the native owner folder picker and separate file permission gate are in place.

See [M4 technical scope and deferred hardware checks](M4-APP-EXPERIENCES.md).

## M3: owner-approved Mac app launcher bridge

M3 introduces a separate signaling capability: phone requests app access, the local Mac host approves, the phone fetches a bounded catalog, and may launch entries identified only by an opaque ID. The Mac resolves each launch ID against its own freshly enumerated installed-app catalog, using macOS open via execFile **without shell evaluation or phone-provided paths**. Permission expires in five minutes or on disconnect, and is revocable. The phone UI is currently Safari. See [M3 scope](M3-IPHONE-MODE.md).

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
- **M2 macOS input alpha is implemented in source, not yet physically tested**: a user-compiled Swift child process can post normalized left clicks after checking macOS Accessibility trust and exactly one active display. It does not open a network port.
- The authenticated viewer asks for control, the **locally connected Mac host** approves each short 2-minute grant, and the agent is spawned *only after approval*. Control is revoked on stop sharing, disconnect, session stop, native-agent failure or expiry.
- Keyboard, mouse dragging, right click, multi-monitor, signing, production authentication, audit trails, and permission-hardening remain unimplemented; see [M2 safety](M2-TOUCH-CONTROL.md).
- A true mobile experience should favor low-bitrate stream while minimized; browser throttling and iOS background process behavior are not guaranteed.
- External remote access, unattended control, TURN/relay, file transfer, audio capture, unattended persistence, and multi-monitor are outside the first vertical slice.

## Proposed future protocol

Prefer established, audited media libraries and transports over rolling custom cryptography. The host and viewer should mutually authenticate pairing identity and establish an encrypted media/data channel. Input messages must carry authorized capability, session ID, replay protection, and bounded event frequency. All permissions should be revocable at the host.

## Deployment warning

The current Node server is a research harness, **not** a remote desktop daemon. Browser `getDisplayMedia` mandates interactive consent and cannot grant unattended capture. The experimental touch-alpha has a short-lived authorization gate but has **not** had a security audit or physical device acceptance. It must never attempt hidden persistence or unattended input.
