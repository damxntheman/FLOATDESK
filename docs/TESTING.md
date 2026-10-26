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
| Tap PiP and return to full Safari without pairing | Not yet checked | Requires separate observation |
| Network loss and automatic recovery | **Promising, user-reported** | After the suggested iPhone Wi-Fi interruption test, user said the video *seemed to reconnect without tapping Refresh video*. Not independently observed or timed; no repeat test or separate authentication/transport evidence. |
| Stopped screen capture / host lock | Not yet checked | Must stop presenting an inaccurate live state |
| Battery, sustained duration, thermal behavior | Not measured | Longer physical test required |

**Evidence level:** User-reported physical iPhone 16 test, not independently observed or instrumented. It establishes browser PiP feasibility for this hardware/network configuration, not universal iOS support or production-grade reliability.

**Follow-up report (2026-10-26):** In response to the requested Wi-Fi-off/Wi-Fi-on recovery exercise, the user said: “Even better, it seemed to reconnect without clicking refresh.” Record this as an **apparent automatic recovery on one iPhone 16 trial**, not proof that every interrupted connection resumes. The exact outage duration, reconnection delay, whether a fresh pairing code was required, and independently verified stream freshness were not explicitly provided. No manual Refresh video action was used in the reported trial.

**Next gate:** Verify return to Safari without re-pairing, repeat a controlled Wi-Fi interruption while watching a changing clock/video feed, record actual recovery time, then validate capture revocation. Test the explicit Refresh video button only if necessary.

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
4. Generate a trusted **development server certificate** containing the actual Mac IP (substitute `192.168.1.20` with your real address):

   ```sh
   mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem localhost 127.0.0.1 192.168.1.20
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
| Return to Safari | Same session? Does live video return without re-pairing? | Not tested |
| Screen capture stops at host | Viewer notices loss/accurate status, no leaked frame | Not tested |
| Network loss and restoration | Record signaling recovery **and** live media independently | Apparent automatic recovery reported once, without tapping Refresh video; repeat and timing not yet verified |
| iPhone lock/unlock and host sleep/wake | Record whether video freezes, ends or resumes | Not tested |
| Remove test CA profile after test | Settings → General → VPN & Device Management | Not tested |

**Important caveat:** iOS supports PiP for supported media, but live `MediaStream` video in Safari PiP can behave differently from ordinary video playback. Browser PiP and background operation cannot be assumed; the result may require a native iOS viewer. Do not mislabel an unsupported PiP result as a WebRTC video transport failure.

### Decision gate

Now that live iPhone PiP and one apparent automatic media reconnection have been user-reported, **retain the browser-first viewer for the next test**. Repeat and measure recovery, then verify return-to-app, capture revocation, and safe shutdown before considering a native player. Do not equate 'PiP stayed live' with proven instant reconnection.

No macOS-only observation proves mobile behavior. Native touchscreen input is **not implemented** in this browser prototype.
