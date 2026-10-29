# M15 — Native Mac consent research foundation

**Status:** M15 safe development batch built in GPT-6 without Astra. **This is not native owner authentication or production authorization.** Existing hardware testing remains deliberately deferred.

## What the owner asked

Continue FLOATDESK without requiring access to Astra. Build as much as possible responsibly in the current conversation; keep real Mac privileges disabled until device identity, human consent and service trust are independently verifiable.

## Source/evidence baseline

- Repository: `damxntheman/FLOATDESK`, `main` at start of this work: `7217ec314b90f7d79c38f2946c7fe0ee18458ef9` (M14).
- M14 was 90/90 Node tests and two macOS jobs, all passed on `main`.
- M13: `docs/M13-ASTRA-REVIEW.md` identifies F1 (localhost host impersonation), F4 (Node-controlled native helpers), F6 (offline media lease), F10 (service identity/shutdown), F11 (resource budgets) and F15 (main actor hashing).
- Read `docs/M14-TERRA-IMPLEMENTATION.md` for the JS ledger model: **no identity proof**, no live imports.
- This batch modifies **native research Swift, its headless smoke fixture, CI, and docs only**. It does not change WebRTC/JS source, Files/Terminal behavior, Apple entitlements, listeners or any running Mac authorization process.

## Native model implemented

`native/macos/FloatdeskNativeConsentResearch.swift` implements a synchronous, `@MainActor` *test reference* of a future local authority.

1. A *trusted test fixture* supplies a viewer label and opens a session. That label is neither authenticated nor a device key.
2. A request for a narrowly scoped capability creates a **pending local presentation** with exact capability, opaque resource label, operation set, requested TTL, viewer label, session epoch, revocation epoch and 30-second deadline. Receiving a request alone grants nothing.
3. The method `approveFromLocalUI` is a mock of future on-Mac approval. It requires an **exact matching prior presentation** that is still pending and current. It is **not wired to AppKit** or an authenticated owner: no claim of actual approval security is made.
4. The resulting in-memory grant is tied to the current instance generation, session/viewer, capability, exact opaque scope, requested operations, expiry and one-way operation sequence. View/watch can NEVER authorize click; Files/list can NEVER authorize write.
5. `authorize` creates a one-use local receipt; `complete` rechecks revocation, session and deadline before a hypothetical separately guarded effect/result. No effect is executed. The core cannot undo effects already dispatched to other processes.
6. Scope revoke invalidates pending approvals and outstanding receipts; disconnect/stop invalidate grants; resume never restores permission. A new instance has a fresh generation; time rollback poisons the model. Stores are intentionally bounded.

Unlike the JS research model, this adds a **Swift implementation and macOS compiler/runtime checks** that can inform a future native authority without trusting JS or enabling permissions. It is deliberately **not linked into the existing menu app**.

### Native research limitations

- The test-only `startSession(viewerLabel:)` trusts caller-supplied text; it is **NOT independently authenticated iPhone enrollment**. No certificate, code signature, device key or Mac owner unlock check exists.
- `approveFromLocalUI` is callable from in-process Swift code and models a future local UI action; it is **NOT a proof of a human click**, authenticated XPC peer or trusted Mac user.
- `opaqueScope` is a label, not a verified file descriptor, app bundle, CGEvent permission or selected display.
- In-memory receipts are reference tokens only; they have **no authenticated wire representation**. Real effects require native enforcement and revocation/dispatch serialization.
- The model runs on MainActor for simple deterministic CI. A production service must audit blocking/UI timing and separate the actor from slow work.
- This reference is intentionally a single-process test core. Signing an executable or moving it behind XPC **alone** does not authenticate external peers or protect against compromised Node-provided JavaScript.

## Architecture for a real native owner authority — pending review and device gates

**Recommended target (not implemented):** per-user, Developer ID-signed macOS AppKit host owns the consent UI, trusted device enrollment, grant ledger and individual capability boundaries. A constrained native XPC service independently verifies peer code identity and grant/session/operation on each sensitive action. The transport Node process is deliberately only a relay and **cannot invent approvals**. The Mac independently binds capability scope to actual file root FDs, input target/display or app bundle IDs; do not accept a remote human-readable path as authorization.

**Device identity:** a separate, owner-approved enrollment flow uses an independently confirmed Mac identity and a device-held credential on the iPhone, with a standard authenticated transport (e.g. a reviewed implementation of TLS 1.3 mutual authentication). The Mac authority validates enrolled device and session identity itself; Node forwarding does not authenticate it. Using the existing Safari app and Node-served JS for privileged device-key operations would still make a compromised Node a confused-deputy risk. Keep the Safari/WebRTC browser viewer **view-only where not separately authorized by existing research permissions** until a stronger native client design is reviewed.

**Mac consent:** the Mac native UI shows the verified device, requested operation/scope, exact duration and Stop/Revoke. Only a correctly bound user action and native-authority-owned state can create a grant; no remote payload is allowed to call `approveFromLocalUI` directly. Deny by default on missing proof, changed session, revoked scope, app restart, device replacement or OS permission refusal.

**Process trust:** signed and immutable helper identities, appropriate XPC caller validation, standard OS APIs, app sandbox/TCC authorization per actual process, bounded IPC and independent release review. The native Files broker must bind resource tokens to its selected directory FD; click helper checks target scope and granted operations on each command. A verified signature is not by itself consent.

### Proposed sequence before enabling native privileges

1. Keep this core inactive; review correctness and CI. Add additional edge tests where valuable.
2. Design/implement Mac-native *display-only* consent UI showing **unauthenticated request** clearly and rejecting remote approval; do not send a grant to Node.
3. Review signed Mac app/entitlement model and device enrollment (including key storage, credential rotation/recovery and UI authenticity) against official Apple developer docs and actual hardware.
4. Build verified native peer identity and bounded authenticated IPC in a feature-flagged, deny-all mode; verify wrong peer, replay, expiry, kill/restart on macOS CI and then real MacBook.
5. Independently bind one **read-only, harmless test capability** (not click, Terminal or file contents) to the native grant authority; test real device consent/revoke and TCC. Consider Files metadata only after FD scope is proven.
6. Migrate additional abilities only after tests and owner approval. Preserve existing Safari PiP with no forced native replacement.

## Permission separation / non-negotiables

| Mode | Research state | Native authority next step |
| --- | --- | --- |
| Safari floating PiP | Existing view-only WebRTC path, user-reported working | Never treat watch as click; maintain explicit browser capture consent and stop-sharing behavior |
| Desktop Mode | Existing browser streaming and separate short-click grant | Native click authority must enforce separate user-approved scope and OS Accessibility permission |
| iPhone Mode / app launch | Existing bounded launch permission | Verify actual native app bundle ID and independent launch consent |
| Terminal Preview | Read-only allowlist in Node | Future native grant remains allowlisted; no PTY/shell in this milestone |
| Files | Native read-only metadata broker with selected directory FD | Verify native grant ID maps to the **actual FD**, not an arbitrary string; separate permission and revoke |

Ports: independently started trusted-LAN HTTPS **8788** (Safari PiP, Desktop/iPhone) and separate Mac-only loopback research **8789** remain unchanged. No public listener, router port forwarding or remote auto-start is added.

## Automated test evidence

The new `native-consent-research-macos` GitHub CI job compiles native Swift core plus `FloatdeskNativeConsentSmoke.swift` and runs 13 offline adversarial scenarios: exact displayed approval, operation/scope confusion, sequence replay, exact expiry boundary, pending/stale revocation, unrelated-scope continuation, pre-approval revocation, late prompt, disconnect/resume, stop, service generation, PiP not click, monotonic rollback/resource limit.

A second CI step verifies the model is absent from the live Mac menu, Node/HTML/JS and native helper source paths. All existing Node/macOS jobs must also pass; **no physical tests are claimed**. Record the current CI run and commit in the PR before any merge.

## Deferred gates

- [ ] Native owner authentication/identity and a real AppKit consent UI with verified viewer/device name, deny and revoke, resilient to compromised Node.
- [ ] Signed peer verification, XPC/TCC/Screen Recording/Accessibility policies and data minimization on MacBook M1.
- [ ] iPhone 16 enrolled device authentication, credential recovery and revocation.
- [ ] Actual selected-root FD binding and stale-operation/restart barriers in the Files broker.
- [ ] Live Safari floating PiP under other apps, stop capture privacy, resume/no unnecessary re-pairing, thermal, sleep/lock behavior.
- [ ] Hardened runtime, Apple Developer ID/notarization, signed update/rollback and secure release provenance.

**Model routing:** All M15 research code is authored in GPT-6. Astra is **not required to continue this detached work**, but production signed/XPC/TCC design still needs security review and physical approval. Opus remains for the later full iPhone UX redesign.
