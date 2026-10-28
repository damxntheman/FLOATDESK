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
- [ ] Return from PiP and verify re-pairing is unnecessary; test repeated controlled interruptions, battery, and OS suspension.
- [x] Dedicated Mac host **Stop sharing** button implemented and **user-reported working** with iPhone 16 viewer (2026-10-26), retaining existing pairing and allowing re-share with fresh browser consent. One physical-device report; no separate instrumentation or repeated-stability test.
- [x] **Host capture stops safely and re-share preserves pairing (iPhone screenshot and owner report, 2026-10-26):** viewer showed “Host stopped sharing. Waiting for new capture consent.” with black, paused preview; subsequent Mac Share screen requested **new window selection/consent**, but **no new phone pairing code**. Host sleep/lock and repeated-duration tests remain untested.
- [x] **User-reported short-outage session recovery passed once (2026-10-26):** Wi-Fi off, connection visibly dropped, Safari not force-closed, approximately 10 seconds away, Wi-Fi restored, returned to Safari, and live stream resumed automatically with **no Refresh video tap and no new pairing code**. Exact time-to-live-video, repeated recovery, and full Safari restarts remain unverified.
- [x] Implement a host-directed, paired-viewer video-refresh request with a per-room cooldown and automated signaling tests; **manual Refresh video fallback remains untested on physical iPhone** (automatic recovery was observed).
- [ ] Repeat on Android (native PiP may behave differently).
- [ ] Decide native client approach using **actual** results, not assumptions.

## M5: native-owner-selected, read-only Files Mode

- [x] Finder → phone-native **Files** view with actual folder-name navigation, explicit Finder desktop fallback.
- [x] Independent Mac-selected folder permission; opt-in `NSOpenPanel` picker helper with no command-line path input; 30-second request, 90-second picker, five-minute grant.
- [x] Metadata-only folder listing; traversal/symlink/hidden-name filtering, bounded output, no file contents or writes; Mac and phone revoke on demand and lifecycle cleanup.
- [ ] **Mac M1/iPhone 16 physical acceptance deferred by owner**; especially native picker GUI launch and sandbox/TCC access to selected folders.
- [ ] Improve native macOS sandbox-scoped file handles / fd-safe traversal before product release or sensitive-folder use.
- [ ] Only after real-device verification, consider file content previews/transfers under separate scope and consent.

## M4: App Experience Engine and Terminal Preview

- [x] Declarative app experience descriptor: known canonical macOS Terminal bundle → touch-native Terminal Preview; unknown apps → Desktop Mode / existing launch fallback.
- [x] M4 source: read-only Mac diagnostics commands with explicit **separate three-minute Mac-local approval** and no shell spawn / arbitrary commands.
- [x] Mobile Terminal Preview UI with command buttons, iPhone keyboard form, bounded text output, revocation and reconnect cleanup.
- [x] Internal, **not exposed over network**: metadata-only Files Mode directory containment, hidden/symlink rejection, max entries and traversal tests.
- [ ] Owner physical tests **deferred**: Mac + iPhone Terminal preview and earlier M3 app-launch gate both remain pending.
- [ ] Decide native Mac companion permission/PTY architecture and folder picker before implementing full shell or Files access.
- [ ] Native iPhone frontend and complete redesign with Opus only after the basic app interactions have been proven on devices.

## M3: phone-native-feeling app control

- [x] M3 source: iPhone-style Mac app catalog with owner-approved five-minute session capability, opaque IDs and local Mac launch.
- [x] Protocol and browser unit tests for app consent, revocation and role checks.
- [ ] **Physical MacBook M1 + iPhone 16 gate:** verify permission, real app catalog, Finder launch, revocation, Desktop Mode regression.
- [ ] Add authorized-folder read-only Files Mode (separate permission) and then tested file operations.
- [ ] Research app/window metadata and supported app-level controls before promising universal UI conversion.
- [ ] Profile native Mac/iPhone streaming prototype against existing M2 latency before migration.

## M2: minimum safe remote interaction

- [x] Mac-only **research click agent** implemented in Swift source; compile, Accessibility permission and real device tests pending.
- [x] Request/approve/revoke workflow and 2-minute grant implemented; **not yet physically accepted**.
- [x] Full-view iPhone taps converted to bounded mouse-click coordinates; automated tests cover mapping and grant policy.
- [x] Auto-open immersive iPhone desktop viewer on touch grant, with an always-visible **Exit & revoke** action and manual Expand desktop. Physical iPhone landscape/portrait verification pending; iPhone Safari does not guarantee arbitrary-element OS-level fullscreen.
- [x] **M2 physical update (2026-10-26):** after PR #17 the owner reports Exit & revoke working and accurate phone-to-Mac taps. Performance remains unmeasured.
- [ ] **M2 usability refinements**: top non-obscuring iPhone Exit & revoke toolbar in landscape; no diagnostic tap dot; low-refresh Mac host thumbnail with pause/resume. Implemented in the next UI update; owner device acceptance pending.
- [ ] Native agent compilation and successful Mac+iPhone click; confirm denial before approval and immediate revocation.
- [ ] Scrolling, right-click, dragging, typing, keyboard, auditable event trail and app signing.
- [ ] Stronger authentication, protocol replay protection and production security audit.

## M3: public beta

- [ ] Installer signing, release provenance and reproducible packaging.
- [ ] Security review and threat modeling for remote access.
- [ ] macOS/Windows host smoke tests, iOS/Android viewer matrix.
- [ ] Accessibility, localization, audio options, network fallback, privacy redaction.
- [ ] Open-source contributor onboarding and release automation.

**Not a promise:** Windows/Linux/macOS host support in repository description describes the long-term goal, not v0.1 capabilities.
