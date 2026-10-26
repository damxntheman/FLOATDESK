# Device-validation worksheet

Document observed behavior, not intentions. Never report a pass for a phone that was not physically tested.

## Desktop smoke test (two tabs)

1. `npm install && npm test && npm start`.
2. Visit `http://127.0.0.1:8787` in two desktop tabs.
3. Host chooses Create session; viewer enters code and connects.
4. Host chooses Share screen, approves the prompt, selects a window/display.
5. Verify live video in viewer. Try PiP, and note browser permission errors.
6. Reload viewer and check whether the session resumes or requires manual media renegotiation.
7. Stop sharing and verify no new captured frames arrive.

## iPhone + Mac

Use trusted-LAN HTTPS configuration in README; verify certificate trust.

| Scenario | Expected to test | Actual |
| --- | --- | --- |
| Safari viewer receives stream | Video and delay | Not tested |
| PiP button works | Transition success or exact error | Not tested |
| Switch to WhatsApp | Live preview persists or suspends | Not tested |
| Return to Safari | Session resume vs new share consent | Not tested |
| Network interruption | Signal and video recover separately | Not tested |
| Lock / wake Mac | Correct failure status and permissions | Not tested |

Record iOS version, Safari version, Mac OS version, network, start/end time, connection delay, battery/thermal observations, and screenshots excluding private information. Re-test with Android after native approach is chosen.

## Definition of success

M1 is feasible only if video remains viewable in PiP through the target multitasking sequence without false status, and returns to full-view mode reliably. If browser PiP/background streaming fails, document it as a negative feasibility result and prototype a native player; do not conceal failure or bypass platform rules.
