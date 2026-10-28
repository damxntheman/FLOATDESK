# M13 — Astra handoff: production Mac companion architecture and security

**Owner-approved handoff:** 2026-10-28. This document is a request for a **separate Astra session** after twelve milestones were built in the current GPT-6 ChatGPT conversation. It is NOT evidence that Astra has already begun, and NOT an approval to distribute or deploy software.

## Entry point and baseline

- GitHub repository: `damxntheman/FLOATDESK`, default branch `main`.
- Starting, pre-handoff main commit: `1c19602443f372a7cf49d59651a5daca27144891` (M12).
- Verified GitHub Actions for this commit: all three jobs succeeded; **58/58 Node tests** and macOS runner native build, research ad-hoc signing, filesystem fixture, process/start-stop/owner-death/config-lock and M12 integrity/release-negative checks passed.
- Do not present these as MacBook M1 / iPhone 16 physical acceptance, notarization, valid TCC access, or production distribution.
- Review first: `README.md`, `SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TESTING.md`, `docs/M7-NATIVE-FILES-BROKER.md`, `docs/M8-MAC-HOST-SHELL.md`, `docs/M9-LOCAL-SERVICE-LIFECYCLE.md`, `docs/M10-PARENT-BOUND-RECOVERY.md`, `docs/M11-MAC-SETUP-LOCK.md`, `docs/M12-LOCAL-INTEGRITY.md`, and **actual code/tests/CI**. Treat documentation as assertions to verify, not proof.

## Product vision and absolute invariants

**FLOATDESK — Your Mac, reimagined for your iPhone.** Mac-first, using an owner-controlled Mac to serve a paired iPhone. Three complementary experiences must coexist:

1. **PiP:** an always-available **view-only** floating live stream of the approved Mac desktop during other iPhone apps. This is a **non-negotiable product feature**. The owner reported live Safari PiP working on iPhone 16 over trusted LAN on 2026-10-26 (including WhatsApp foreground), but full production reliability is unverified. Do not promise PiP mouse control.
2. **Desktop Mode:** original Mac browser/WebRTC live capture with separate, explicit, short-lived Mac-owner remote click permission, dedicated iPhone Exit. Screen capture may begin only with fresh OS/browser/macOS consent. Revocation/Stop sharing must stop video exposure, while permitted pairing may survive fresh consent.
3. **iPhone Mode:** phone-friendly app launcher and bounded app experiences (currently read-only Terminal Preview; metadata-only Files). Do not claim arbitrary Mac applications run natively on iOS or enable unrestricted PTY, file edits or transfers without separate security design and owner approval.

**No regression or silent replacement** of the current trusted-LAN HTTPS WebRTC Safari PiP path. Existing **port 8788** is an independently started LAN research service; **127.0.0.1:8789** is an isolated Mac-only development service managed by the native menu shell. M13 should not merge these, start a new remote listener, port-forward, introduce auto-start, or broaden remote permissions without independent owner-approved design and real device tests.

Only operate on the authenticated owner's repo and controlled hardware. Do not read, publish, ask to paste, or commit private keys, certificates, signing credentials, personal public/LAN IP addresses, session/pairing codes, real file contents, or screenshots.

## Current components to audit (check implementation, not just descriptions)

- **Streaming/session/consent:** `src/server.js`, `src/registry.js`, `src/recovery.js`, `public/client.js`, tests in `test/signaling.test.js`, `test/recovery.test.js`, `test/client-capture.test.js`, `test/immersive-view.test.js`, `test/product-contract.test.js`. Consider local-host authentication, Origin handling, pairing/replay/resume, capture revocation, cross-session message races and denial of service.
- **Mac click and app launch:** `native/macos/FloatdeskAgent.swift`, `src/control.js`, `src/mac-apps.js`, `src/app-access.js`; separate OS Accessibility approval from temporary phone permission; no simulated game inputs or silent control.
- **Terminal Preview:** `src/terminal-preview.js`, `src/terminal-grant.js`, `src/app-experiences.js`. Only allowlisted read-only diagnostics, not an interactive shell.
- **Native Files broker:** `native/macos/FloatdeskNativeFilesBroker.swift`, `src/native-files-broker.js`, `src/files-grant.js`, `src/files-policy.js`. Native `NSOpenPanel` and fd-based read-only metadata in the same process, independent grant; audit symlink, FD lifecycle, sandbox/TCC scope and cancellation. Older M5 split-picker path is a less secure optional fallback, not an endorsed production design.
- **Native Mac shell/companion handshake:** `native/macos/FloatdeskMacHost.swift`, `native/macos/FloatdeskCompanionProbe.swift`, `src/native-companion.js`, `src/native-host-inventory.js`, `native/macos/MacHost-Info.plist`.
- **Local service management:** `native/macos/FloatdeskLocalService.swift`, `native/macos/FloatdeskInstanceLock.swift`, `native/macos/FloatdeskHostSettings.swift`, `src/managed-host.js`. Research process owner-pipe EOF, advisory file lock, GUI-selected paths, no signed provenance or forced kill guarantee.
- **M12 integrity and release check:** `native/macos/FloatdeskSourceSeal.swift`, `native/macos/FloatdeskSealSmoke.swift`, `scripts/build-mac-host.sh`, `scripts/verify-mac-release.sh`. Hash snapshot detects accidental source changes but DOES NOT authenticate code/signing, pin `node_modules`, defeat check-use races or a malicious same-user actor. CI release check correctly rejects ad-hoc research build.
- **CI:** `.github/workflows/ci.yml`, macOS compiler/setup tests, Node unit/integration suite, tests for permission isolation and PiP unchanged.

## M13 primary mission

Produce a **grounded production Mac companion architecture/security review** that identifies the safest practical path from the research Mac menu/bar + Node server + separate native helpers toward an owner-approved, signed, distributable macOS host **without sacrificing existing PiP or prematurely enabling privileged features**.

### Required work, in order

1. **Verify the exact repo state and establish evidence.** Read current `main`, CI, source and existing device report distinctions; check for repo updates before branching. Create `feature/m13-astra-native-architecture` (or a clear equivalent) from current main. All changes go through reviewed PR(s); avoid direct main edits.
2. **Threat model with explicit trust boundaries:** phone and paired browser, HTTPS signaling, local Mac host browser, Node, child Swift processes, macOS OS permission boundaries (Screen Recording/ScreenCaptureKit, Accessibility, file chooser / security-scoped URLs, terminal/PTY), and on-device storage. Enumerate assets, attackers (unpaired phone, paired-but-compromised viewer, LAN peer, malicious local same-user process, compromised Node dependency), attack surfaces, abuse cases and fail-closed revocation behaviors. Separate current evidence from assumptions.
3. **Architectural decision record:** compare at least two viable Mac distribution models (for example, signed AppKit/SwiftUI host owning the privacy-sensitive components with separately constrained Node transport; and a more-native host with audited XPC/service separation). Recommend a pragmatic next step given a solo developer, MacBook M1 and iPhone 16. Explain signing identity, macOS hardened runtime, notarization/Gatekeeper, whether App Sandbox is used and its trade-offs, TCC permission identity and process context, XPC applicability, helper lifecycle, data flow and update/rollback. **Verify Apple-platform details against current official Apple developer documentation before making definitive claims.** No assumptions that permission in one process transfers to another.
4. **Capability-by-capability consent matrix:** PiP/capture, viewer pairing, click/input, application discovery and launch, read-only terminal diagnostics, read-only Files; future (disabled) interactive PTY and transfer/write. For each, identify grant authority, scope, TTL, session binding, revocation, audit metadata (minimal, local), Mac privacy permission, UI cue, and what is NOT enabled. PiP must never grant input.
5. **Gap analysis and prioritized remediation:** list concrete high/medium/low issues with file references and realistic exploit conditions. Flag security-sensitive speculative risks as unverified until reproduced. Prioritize safe milestones to address unauthenticated local host interfaces, Origin/session lifecycle, privilege identity, secret storage, process races, signed helper trust and M12 hash gaps.
6. **Implement a substantial bounded batch of independently testable work if warranted**, for example pure service interfaces, versioned capability protocol schema, fail-closed message/identity validation, owner consent state machine/unit tests, architectural diagrams/ADRs, CI architecture checks. Do not refactor/replace working WebRTC or change host networking, capture backends, native helper entitlements, production signing or full PTY before the design is reviewed and relevant real-device permission checks exist. Prefer small migration seams with feature flags, robust tests and backwards compatibility.
7. **Run all available tests and provide evidence:** `npm test` plus macOS CI / source compile where available. Include exact commit, PR link, tested environment, pass/fail counts and what remains unverified. Only merge after CI success and security review of your own changes; avoid a merge if design uncertainties could introduce risk.
8. **Leave a precise handback report** in `docs/M13-ASTRA-REVIEW.md` and the PR: architecture decision and alternatives, data flow diagram, threat model, open risks, changes, CI, required physical-device validations and clear implementation next milestones. Provide a repo-based handoff for resuming in ChatGPT GPT-6 or, later, Opus for iPhone frontend.

### Required physical / external blockers — DO NOT invent passes

- Real **MacBook M1**: GUI Mac Host startup, OS Screen Recording and Accessibility TCC dialogs/identity, native Files `NSOpenPanel` and scoped file access, signed helper invocation, process crash/revoke/lock/permission behavior.
- Real **iPhone 16**: Safari PiP foreground/background and return, stream stop/privacy, touch consent, iPhone Files/Terminal, reconnect and battery/thermal behavior. Some basic PiP/capture observations are **user-reported for M1**, not certified acceptance for M2–M12 or any native replacement.
- Apple Developer Team ID, signing certificates, notarization credentials or distribution account access; request owner action only when truly needed and **never ask to paste secrets into chat**.
- Any risky/irreversible operations, new network exposure or real file writes/transfers require explicit user approval. Do not push a release, enroll launch agents or change macOS preferences yourself.

### Delivery style

The owner values **high-output sessions** and does not want frequent unnecessary clarifying questions. Complete as much independent safe, verified work as possible per session, then stop at a **genuinely mandatory** physical-device, signing/credential or architecture-approval gate. Do not say “all tested” when only CI passed; document pending checks. Avoid boilerplate and unfounded assurances.

**Model routing:** This is the **Astra** architecture/security handoff. **Opus** is reserved for the later premium, mobile-native iPhone interface revamp; no Opus work is requested in M13.

## M13 acceptance criteria

- [ ] Read current repository source and verify baseline CI and docs.
- [ ] Threat model includes phone/LAN, local host, server, native child, OS privacy/entitlements, PiP, files and terminal.
- [ ] Architecture ADR compares >=2 implementation options, chooses a minimal viable signing/XPC/TCC/service strategy and distinguishes documented facts from device-dependent questions.
- [ ] Capability permission and revocation matrix with PiP view-only invariant.
- [ ] Prioritized security issues linked to exact code, remediations and limitations.
- [ ] Bounded safe source/docs/test changes implemented if feasible, with CI evidence; no premature permissions or native PiP replacement.
- [ ] `docs/M13-ASTRA-REVIEW.md` + PR + unambiguous next-device-gate checklist and handback instructions.
- [ ] Current port **8788** trusted-LAN PiP server and separate **8789** loopback research host unchanged unless explicitly approved.
- [ ] No physical acceptance claimed without actual tests, no secrets/IPs in GitHub, no production release or native entitlement assumptions.
