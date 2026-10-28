# Milestones — evidence before claims

## Permanent product requirements

- **Floating, live Picture-in-Picture is core, not a throwaway prototype.** iPhone Mode (mobile Files/Terminal/apps), Desktop Mode, and PiP must coexist. PiP displays the approved Mac stream while other phone apps are foreground; tapping/returning to FLOATDESK restores the authorized viewer without unnecessary re-pairing. Do not promise mouse input inside the system PiP window.
- Do not remove the existing user-reported working browser PiP route until a replacement passes real iPhone testing. Measure visual continuity, return/resume, suspension, battery and capture-stop privacy. Hardware tests remain postponed at the owner's request.
- Never publish a person's actual local or public IP, credentials, private certificates, pairing codes or tokens in repository content. Use generic placeholders in all public setup examples.

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

## M8: macOS menu bar host integration — research shell

- [x] Compile an AppKit menu bar shell with local-only **Open Mac dashboard** action; research Node browser server still started separately, not bundled or managed by this shell.
- [x] Build a reproducible `.app` shell with LSUIElement, separate app metadata, and macOS CI **ad hoc** signature/build checks. No Developer ID signing, notarization or production installer yet.
- [x] Mac-local-only native helper inventory: disabled/configured/missing/invalid, without disclosing paths, IPs or granting service permissions; paired iPhone cannot request it.
- [x] Retain working browser PiP, read-only floating video, explicit Mac screen consent, Desktop Mode and existing iPhone app experiences untouched.
- [ ] **Physical Mac M1 + iPhone 16 checks deferred**: menu bar launch, browser HTTPS dashboard, M7 helper, PiP / background behavior, TCC and menu item behavior.
- [ ] Signed, sandbox/TCC-aware native Mac application packaging + permission UX and secure service process lifecycle; review network binding before integrated service startup.
- [ ] Native iPhone app architecture and PiP media surface require **device verification** before any Safari/WebRTC replacement.

## M7: native owner-scoped read-only Files

- [x] Swift Mac helper performs owner folder picker and file listing inside the same process; original absolute path is never transmitted to Node or the phone.
- [x] File descriptor-based openat/O_NOFOLLOW traversal and no-follow file type checks; hidden names, symlinks, absolute paths, and file writes excluded.
- [x] Strict, bounded Node IPC and automatic subprocess kill on revoke, session end, timeout or native process failure.
- [x] macOS GitHub CI compilation and isolated fixture/symlink traversal test; Node automated regression tests preserve PiP.
- [ ] Deferred real MacBook M1 + iPhone 16 UI, picker, privacy/TCC, crash, reconnect and PiP tests.
- [ ] Signed native companion, complete TCC/sandbox threat model and product hardening before production use.

## M6: native Mac companion bridge — controlled groundwork

- [x] Versioned, locally spawned Swift companion handshake with strict JSON validation, bounded IPC, timeouts, explicit opt-in and **no privileged capabilities by default**.
- [x] Mac-local, host-only readiness check on existing authenticated signaling channel. A paired phone cannot spawn or invoke the native helper.
- [x] Separate helper from the existing M2 click agent and M5 folder picker; no change to browser capture or iPhone PiP path.
- [x] Automated failure/role tests: malformed versions, forged capabilities, oversized replies, crashes, timeouts, viewer denial and unsupported platforms.
- [ ] **Mac physical gate deferred:** build and invoke Swift helper, examine app-signing/entitlements, confirm macOS and host behavior. Do not equate CI with native compilation.
- [ ] Plan signed native Mac app lifecycle and migrate one bounded function at a time (first: folder picker + file I/O in same permission-scoped process; later: capture + control).
- [ ] Preserve view-only floating PiP for iPhone while iPhone Mode, Desktop Mode and a native player coexist. Native iOS PiP requires explicit iPhone validation.
- [ ] Replace the research IPC handshake with an audited, mutually authenticated native companion channel only when real capabilities are being introduced.

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
