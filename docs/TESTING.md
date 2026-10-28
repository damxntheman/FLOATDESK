# Device-validation worksheet

Document **observed behavior, not intentions**. Never report a pass for an iPhone or Android phone that was not physically tested.

## Mac browser smoke test — user-reported evidence (2026-10-26)

**Result:** User reported successful local video viewing and desktop-browser Picture-in-Picture multitasking.

| Check | Reported result | Qualification |
| --- | --- | --- |
| FLOATDESK starts at 127.0.0.1:8788 | Pass | Port 8787 belonged to another running project, so FLOATDESK was started on 8788 |
| Pair two Chrome tabs | Pass | User reported both tabs displayed the shared content |
| Remote viewer displays shared screen live | Pass | User reported the second tab displayed the content; no frame/latency measurements taken |
| Chrome viewer opens PiP | Pass | User explicitly confirmed PiP opened |
| PiP stays visible and continues updating after switching Mac apps | Pass | User explicitly reported floating PiP stayed visible and live |
| Return from PiP without re-pairing | Not observed | Must be tested separately; user did not report this outcome |
| Network drop/recovery, media renegotiation | Not observed | Automated signaling tests are not a substitute |
| Privacy-safe capture revocation and failure on hardware | Not observed | Must be tested separately |

Source: Direct user report in this project's development conversation, not independently witnessed or instrumented. Host machine is a MacBook Air; Chrome version and macOS version not recorded. The user did not specify exactly which type of display/window was selected in the Chrome picker. Screenshots showed the Chrome share picker and the application launch; no public video or private desktop screenshots are stored. **Do not generalize this Mac/Chrome observation to Safari or iOS.**

## iPhone 16 + Mac — user-reported feasibility result (2026-10-26)

**Reported result:** FLOATDESK opened over trusted local HTTPS on the iPhone 16, the Mac's live shared video was visible, and the iPhone's floating Picture-in-Picture view **stayed visible and live while WhatsApp was open**.

| Scenario | Result | Qualification |
| --- | --- | --- |
| Trusted HTTPS Safari page reaches Mac | Pass reported | iPhone and Mac on local network; actual iOS/Safari versions not captured |
| View live Mac stream on iPhone | Pass reported | User directly confirmed Mac video was displayed |
| Floating iPhone PiP remains live with WhatsApp foreground | Pass reported | Explicit user report on 2026-10-26; no timing/frame measurements |
| Tap PiP and return to full Safari without pairing | Not explicitly checked | Existing Safari page successfully resumed after switching away and restoring Wi-Fi, but returning specifically from active PiP to full Safari is a separate test |
| Short (~10-second) Wi-Fi interruption; return to existing Safari page | **Pass reported (single trial)** | iPhone Wi-Fi off; viewer visibly disconnected; Safari left open, not swiped closed; Wi-Fi back on after ~10 seconds; user returned to Safari and live video resumed automatically, without pressing Refresh video **or entering another pairing code**. Time-to-video not measured; app/browser not force-closed. |
| Host-side screen sharing stopped; re-share with consent | **Pass reported** | iPhone previously showed “Host stopped sharing. Waiting for new capture consent.” and black paused video. Following re-share, user confirmed Chrome requested selecting a window again, **but no new pairing code was required**. The user answered in context of whether video returned; frame continuity not independently instrumented. Host lock/sleep still untested. |
| Battery, sustained duration, thermal behavior | Not measured | Longer physical test required |

**Evidence level:** User-reported physical iPhone 16 test, not independently observed or instrumented. It establishes browser PiP feasibility for this hardware/network configuration, not universal iOS support or production-grade reliability.

**Clarified follow-up (2026-10-26):** The user confirmed they left Safari open (did **not** swipe it away/force-quit), switched the iPhone Wi-Fi off, **saw FLOATDESK disconnect**, stayed away for approximately **10 seconds**, re-enabled Wi-Fi, returned to Safari and **saw the live stream reconnect automatically**, **without tapping Refresh video and without entering another pairing code**. This replaces the earlier ambiguity over whether credentials had to be re-entered. Evidence is still a **single owner-reported physical test**: exact time-to-recover was not measured, no second trial is reported, browser process termination was not tested, and the signaling-vs-ICE recovery path was not instrumented.

**Additional screen-sharing revocation check (2026-10-26):** A screenshot taken on the physical iPhone 16 after host capture was stopped shows the explicit state **“Host stopped sharing. Waiting for new capture consent.”** and a black, paused video player instead of a live desktop. The user confirmed that this matched the intended behavior. An earlier “Host ended the session” report followed an ambiguous click; the user could not remember whether they pressed Chrome's stop-sharing control or FLOATDESK's **End session** action. The repeat screenshot supports correct separation for this test, but does not independently establish what happened in the earlier trial or confirm re-sharing within the same pairing session.

**Follow-up re-sharing test (2026-10-26):** After stopping host capture, user tried the Mac **Share screen** action again. Chrome requested a window selection (expected fresh screen-sharing consent) and the same phone session continued **without a new pairing code**. This supports a successful *consent boundary + retained session* on the real Mac/iPhone setup. It does **not** imply capture consent can be silently reused, nor does it establish a timed playback recovery metric. The user did not explicitly provide a frame-by-frame confirmation after re-sharing, so retain that as a future instrumented check.

**New Stop sharing control — physical device test (user-reported, 2026-10-26):** The owner updated FLOATDESK and responded “It all works broski” after trying the new Mac host Stop sharing / Share screen flow with the iPhone 16 viewer. This supports stopping capture while retaining the pairing and restarting capture after a fresh browser window selection. No separate screenshot, recovery timing, or extended reliability measurement was provided for the new button; a separate End session regression on hardware was not explicitly documented.

**M2 touch-control alpha (source only):** See [M2 setup and acceptance](M2-TOUCH-CONTROL.md). Do not report touch-to-click as physically passed until the owner builds the native Mac agent, authorizes it in Accessibility, explicitly approves control after whole-screen sharing, observes a harmless Mac mouse click from iPhone, and verifies Revoke control and capture-stop fail closed. Default view-only tests must continue passing without the agent.

**Next gate:** Repeat a controlled Wi-Fi interruption with changing visual content and measure time-to-live-video. Separately test PiP return, host sleep, long interruption, Safari force-quit/relaunch, and Android. The planned **Stop sharing** button is a host UI improvement, not a prerequisite for the browser's already-working stop/re-share permissions flow.

### Reproducible setup and remaining device checks

The following checklist remains for completing M1; passing the initial PiP experiment does not close the issue.

### Preconditions

- MacBook and iPhone on the **same trusted Wi-Fi network**, with no guest-network client isolation.
- The host remains awake and FLOATDESK runs in Chrome on the Mac.
- Continue using **port 8788** (port 8787 is already used locally).
- Test with nonsensitive content, never a password manager, private messages, or screen containing secrets.
- This prototype is **not safe for Internet exposure**. No router port forwarding, tunnels, or public hosting.

### LAN HTTPS setup on Mac (research only)

1. Ensure `brew` is installed. Install `mkcert` with `brew install mkcert` and run `mkcert -install`.
2. Inside the repository: `mkdir -p certs`.
3. Find the Mac's Wi-Fi IPv4 address using **System Settings → Wi-Fi → Details → TCP/IP**. You may also try `ipconfig getifaddr en0`, but confirm the correct interface on your Mac.
4. Generate a trusted **development server certificate** containing the actual Mac IP (enter it locally and **do not include it in GitHub commits or issue comments**):

   ```sh
   printf 'Mac LAN IPv4 address: '; read -r MAC_LAN_IP
   mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem localhost 127.0.0.1 "$MAC_LAN_IP"
   ```

5. For the iPhone to trust the server certificate, it must trust the local *root CA*. If you accept the security implications, export **only the public certificate**, not the CA private key:

   ```sh
   openssl x509 -in "$(mkcert -CAROOT)/rootCA.pem" -outform der -out "$HOME/Desktop/FLOATDESK-localCA.cer"
   ```

6. AirDrop that `.cer` certificate to your iPhone, install its configuration profile in **Settings → General → VPN & Device Management**, and then enable trust under **Settings → General → About → Certificate Trust Settings**. Follow Apple's latest UI prompts. **Manually trusting a root CA grants it broad certificate-signing trust; do not install unknown CAs.** Remove this test profile when finished.
7. In Terminal, with `FLOATDESK` as the working directory, run:

   ```sh
   HOST=0.0.0.0 PORT=8788 TLS_CERT_FILE=certs/lan.pem TLS_KEY_FILE=certs/lan-key.pem npm start
   ```

8. On Mac Chrome visit `https://localhost:8788`. On iPhone **Safari (not a Home Screen shortcut or in-app browser)** visit `https://<YOUR-MAC-LAN-IP>:8788`. Confirm that both load **without an untrusted certificate warning**. If there is a warning, stop and diagnose trust/certificate mismatch rather than bypass it.
9. On Mac click **Create a session**, then on iPhone enter the code and tap **Connect**. On Mac click **Share screen** and explicitly approve capture.
10. Check whether live shared content appears on iPhone Safari before testing PiP.

For underlying certificate behavior, see [mkcert's mobile instructions](https://github.com/FiloSottile/mkcert#mobile-devices) and [Apple's certificate trust guidance](https://support.apple.com/en-za/102390).

### Device test checklist

| Scenario | Evidence to record | Result |
| --- | --- | --- |
| iPhone Safari page loads over trusted HTTPS | Device iOS version, Safari version, IP/port, no warning | Pass reported; versions not recorded |
| Pairing and video stream starts | Pairing success, picture displayed and changing | Pass reported |
| PiP button activates on iPhone | Does floating window appear? If not, capture exact error | Pass reported |
| Switch to WhatsApp | PiP visible? Does picture continue changing after 10–30 s? | Live PiP reported; duration not measured |
| Return to Safari | Same session? Does live video return without re-pairing? | **Pass reported** after ~10-second Wi-Fi interruption; Safari stayed open, not force-quit |
| Screen capture stops at host | Viewer notices loss/accurate status, no leaked frame | **Pass reported**: expected “Host stopped sharing” and black paused video, as shown in iPhone screenshot. |
| Host re-shares after stopping | Browser must require new window selection, while existing session remains paired | **Pass reported**: Chrome asked user to select a window again; no new pairing code needed. |
| Network loss and restoration | Record signaling recovery **and** live media independently | **Pass reported once**: Wi-Fi off, visible disconnect, on after ~10 s, live picture resumed with no Refresh video and no re-pairing; no precise timing or instrumentation |
| iPhone lock/unlock and host sleep/wake | Record whether video freezes, ends or resumes | Not tested |
| Remove test CA profile after test | Settings → General → VPN & Device Management | Not tested |

**Important caveat:** iOS supports PiP for supported media, but live `MediaStream` video in Safari PiP can behave differently from ordinary video playback. Browser PiP and background operation cannot be assumed; the result may require a native iOS viewer. Do not mislabel an unsupported PiP result as a WebRTC video transport failure.

### Decision gate

Now that live iPhone PiP and one approximately 10-second Wi-Fi outage with automatic, no-repairing live-picture recovery have been user-reported, **retain the browser-first viewer for the next test**. Repeat and measure recovery, then verify return-to-app, capture revocation, and safe shutdown before considering a native player. Do not equate 'PiP stayed live' with proven instant reconnection.

No macOS-only observation proves mobile behavior. Native touchscreen input is **not implemented** in this browser prototype.

## M3 iPhone Mode first physical test (pending)

App list and launch have been implemented behind an independent five-minute Mac-local authorization grant. See [M3 device checklist](M3-IPHONE-MODE.md). No physical Mac app launch has yet been reported; the device gate remains open.

## M4 deferred physical acceptance

The iPhone-native Terminal Preview and internal Files Mode safety policy have automated tests but **no physical acceptance**. The owner elected to hold device tests temporarily. When ready, follow [M4 test gates](M4-APP-EXPERIENCES.md), as well as still-open M3 Finder-launch gate and M2 regressions.

## M5 Files Mode device acceptance postponed

The owner is not testing on MacBook/iPhone right now. M5 native folder-picker compilation, macOS privacy access, safe browsing and revocation are therefore **unverified on hardware**. See [M5 checklist](M5-FILES-MODE.md); do not mark accepted based on CI alone.

## M6 native Mac companion research gate (deferred)

The optional helper's protocol is unit-tested using mocked processes. **No physical Swift compilation, native macOS execution, native capture or native iPhone PiP verification has occurred for M6.** The owner requested deferred device checks. See [M6 scope/checklist](M6-NATIVE-COMPANION.md). The Mac readiness check reports protocol agreement only and must not be mistaken for an operational native Mac companion.

## M7 native Files broker acceptance — deferred

The native Swift broker is compiled and fixture-tested on GitHub's macOS runner. Node IPC security and PiP regression tests are automated. **Physical Mac owner GUI, iPhone navigation, TCC permissions and PiP remain unverified for M7.** See [M7 checklist](M7-NATIVE-FILES-BROKER.md). No physical tests are requested until owner is ready.

## M8 macOS host shell — deferred device acceptance

GitHub CI compiles the Swift menu bar shell, assembles a research `.app`, validates its plist and applies **ad hoc signing only**. Node tests check that only the authenticated local Mac host can query sanitized service configuration. **No physical Mac menu bar, app opening, native TCC or iPhone PiP acceptance has occurred in M8.** The owner requested continuing development without physical testing. See [M8 checklist](M8-MAC-HOST-SHELL.md).

## M9 deferred device validation

macOS CI compiles the new Swift service manager and proves loopback Node start, duplicate denial, HTTP response and Stop via a separate smoke harness. **Not yet validated:** physical Mac menu clicks, process termination after app crash, native signing/TCC or iPhone PiP regression. Owner requested postponing physical tests. See [M9 checklist](M9-LOCAL-SERVICE-LIFECYCLE.md).
