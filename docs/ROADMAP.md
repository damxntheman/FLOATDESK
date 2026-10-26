# Milestones — evidence before claims

## M0: repository foundation (this change)

- [x] Open-source license, contribution/security policies, implementation boundaries.
- [x] Minimal view-only WebRTC/signaling source and pairing/session unit tests.
- [x] CI passed on GitHub for the original seven tests; subsequent changes require a new passing run.
- [x] Negotiation-scoped ICE handling, ordered signaling, and explicit capture-stop status implemented (unit/integration tested, not device-validated).
- [x] Mac/Chrome two-tab view-only stream and floating PiP reported working by the user on 2026-10-26 (not independently measured; see docs/TESTING.md).

## M1: mobile PiP feasibility

- [x] Live Mac-to-iPhone 16 Safari viewing user-reported successful (2026-10-26; latency not measured).
- [x] Floating iPhone 16 Safari PiP stayed visible and live with WhatsApp foreground, user-reported (2026-10-26; not independently verified).
- [ ] Return from PiP and verify re-pairing is unnecessary; test a real interrupted stream, battery, and OS suspension.
- [ ] Repeat on Android (native PiP may behave differently).
- [ ] Decide native client approach using **actual** results, not assumptions.

## M2: minimum safe remote interaction

- [ ] Separately authorized desktop host agent.
- [ ] Host prompts for view vs control permissions; clear always-visible disconnect control.
- [ ] Touch gestures mapped to mouse events; long-press right click; keyboard.
- [ ] Transport recovery without redundant login where still authorized.
- [ ] Input event rate-limits, replay protection, audit logs, permission revocation.

## M3: public beta

- [ ] Installer signing, release provenance and reproducible packaging.
- [ ] Security review and threat modeling for remote access.
- [ ] macOS/Windows host smoke tests, iOS/Android viewer matrix.
- [ ] Accessibility, localization, audio options, network fallback, privacy redaction.
- [ ] Open-source contributor onboarding and release automation.

**Not a promise:** Windows/Linux/macOS host support in repository description describes the long-term goal, not v0.1 capabilities.
