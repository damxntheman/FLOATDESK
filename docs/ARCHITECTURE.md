# Architecture and non-goals

## M7: fd-rooted Mac Files broker

The optional native/macos/FloatdeskNativeFilesBroker.swift uses NSOpenPanel and retains the selected directory file descriptor in the SAME process. All nested directory traversal uses openat with O_NOFOLLOW; directory entry metadata uses fstatat without following symlinks. Node src/native-files-broker.js receives only owner-selected folder LABEL and bounded relative metadata, validates request IDs/schemas, and terminates the native process on revoke, exit, timeout or disconnect. Enable through FLOATDESK_NATIVE_FILES_BIN, otherwise use the existing M5 research path. Neither M7 nor M5 has verified real Mac TCC permissions; CI is not a substitute for physical acceptance. Full details: [M7 document](M7-NATIVE-FILES-BROKER.md).

## M6: native Mac companion handshake boundary

`src/native-companion.js` talks to an **explicitly configured, locally spawned native macOS binary** over a bounded stdio JSON line. This stage accepts only `version:1`, `hello` + random 128-bit `requestId`, then expects a matching `hello-ack` and a strictly **all-false** capability map. It refuses mismatched protocol versions, unsolicited privileges, invalid JSON, oversized frames, timeouts and process crashes. The helper exits after one response. The server's `companion-probe` action is permitted only to the **authenticated local Mac host**, never the paired phone. No remote payload is forwarded to the helper. This is not yet a production XPC service, screen capturer, native PiP pipeline or privilege escalation mechanism.

**PiP is core to the product** and remains separate from all privileged input/file/Terminal operations; it continues using the user-reported working browser/WebRTC viewer until a native iOS version passes real tests. See [M6 plan](M6-NATIVE-COMPANION.md).

## M5: opt-in native Mac folder chooser and read-only Files

`src/files-policy.js` provides restricted folder metadata enumeration. A separate Mac-local owner click invokes a **compiled** `NSOpenPanel` helper with no user-supplied command paths; the selected folder is retained only in server memory. The phone never sends an absolute path and never sees the full root path. `FilesGrant` is independent of the existing application, Terminal Preview and touch grants. The picker is **not configured by default**; browse requests are rejected until the owner opts into `FLOATDESK_FOLDER_PICKER_BIN`. The Mac server enforces a selected-root-only, relative-path, read-only listing protocol.

**Security limitations:** the Mac GUI helper and Node file-reader are separate processes. Native picker sandbox permissions and TCC scope may not automatically transfer to Node. Path containment checks are not an fd-based race-proof traversal. This remains LAN-only alpha code; no file contents or writes are exposed. See [M5 scope](M5-FILES-MODE.md).

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
