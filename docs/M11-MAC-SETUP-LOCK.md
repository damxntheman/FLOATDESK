# M11 — Mac Host setup and duplicate-service ownership

**Scope:** FLOATDESK Mac Host *research alpha*, not a finished signed or notarized Mac installer. All implementation is performed in this ChatGPT GPT-6 conversation, not Astra/Opus. MacBook M1/iPhone 16 hardware checks remain deferred by owner choice.

## Why

M9–M10 introduced manually managed local Node startup, ownership pipes and crash cleanup, but launching the menu app with `FLOATDESK_REPO_ROOT` and `FLOATDESK_NODE_BIN` environment variables was cumbersome. Independent menu-bar instances could also try launching duplicate managed services. M11 addresses these two research concerns while keeping the existing iPhone **PiP** pipeline untouched.

## Mac setup experience

From the Mac's FLOATDESK menu, choose **Configure local dashboard…**. macOS displays a folder picker for a trusted FLOATDESK checkout (contains `package.json` and `src/managed-host.js`), then a file picker for the installed Node executable. Both selections must validate before either replaces prior settings. Cancelling either panel leaves the previous valid settings in place. **Clear local configuration** deletes these settings; it does not stop a separately running child.

Selected values are stored in **macOS UserDefaults**, locally to this research app. No username, IP, session token, pairing code, TLS certificate or file content is sent to GitHub or the phone, and there is no automatic server start. **The local paths are not secrets**, but Mac owner selection still matters: this release does *not* verify a Node binary's cryptographic signature, project checkout contents or security-scoped sandbox bookmark identity.

Selecting configuration never starts screen capture, remote input, Terminal commands or file access; each existing experience still requires its own approvals.

## Duplicate-owner protection and stopping

`FloatdeskInstanceLock.swift` obtains a nonblocking file lock inside the user's Application Support directory. It refuses symlink/non-regular lock targets, dangerous file permissions or unexpected file ownership, and rejects a second cooperating Mac menu instance while the first owns the managed service. The lock remains held during Stop until the actual child exits, avoiding premature acceptance of a competing start.

On an unexpected menu-owner death, macOS closes the lock FD, while the M10 stdin ownership pipe closes and tells the Node child to exit. A **hung Node process may not respond to EOF**. This simple research controller does not yet have trusted process groups, a timeout-based force-kill/escalation protocol, complete ancestor-directory trust checks or a signed entitlement model. A hostile local process can interfere with advisory locks; this is not an access-control mechanism.

## Strict separation from PiP

- **8789**: M11 managed **HTTP loopback only** dashboard. No iPhone network path or new screen-capture entitlement.
- **8788**: independently managed **HTTPS trusted-LAN** browser/WebRTC stream, including Safari **floating view-only PiP**, Desktop Mode, M3 apps, M4 Terminal Preview and M7 Files. No automatic changes, restarts or stops of this service.

## CI coverage

- macOS runner compiles the Swift menu app with settings and locking support, validates the ad-hoc development bundle.
- Headless Swift tests verify valid/invalid configuration, atomic updates, Clear, single-process competing locks, cross-process exclusion and lock release after owner exit.
- Prior M9–M10 tests still verify loopback Node start/stop, simulated parent crash and pipe EOF shutdown.
- Node tests protect independent PiP availability.

## Physical acceptance gates — deferred

- [ ] MacBook M1: open the menu app normally (without Terminal environment injection), select checkout and Node, ensure Start enables.
- [ ] Cancel either panel and confirm existing configuration remains unchanged; Clear disables starting but doesn't terminate a running child.
- [ ] Two independent Mac Host instances cannot start duplicate local managed services.
- [ ] Start → Stop → restart works with accurate stopping indicators; accidental app exit cleans up without interrupting 8788.
- [ ] Confirm no sensitive settings/paths appear in the phone or repository.
- [ ] Verify iPhone 16 Safari PiP still floats with another iPhone app foreground and user can return to desktop without new pairing.
- [ ] Verify macOS privacy/TCC, signing, app sandbox, source integrity and hardened shutdown before a wider beta.

**Future model handoff:** Astra is appropriate when we truly need deep signed macOS host, XPC/TCC, code-signing and service-lifecycle security review. Opus is for the later premium iPhone UX redesign. No handoff has happened.

## M12 follow-up: local change detection

Mac-selected project and Node paths now receive a local SHA-256 snapshot of the executable and current research browser/server source. If that code changes before a new managed 8789 Start, the menu requires the Mac owner to reapprove via **Configure local dashboard…**. This is a development change detector, not signed binary identity or a substitute for macOS TCC security. See [M12](M12-LOCAL-INTEGRITY.md).
