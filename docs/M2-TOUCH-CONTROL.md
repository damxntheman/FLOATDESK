# FLOATDESK M2 — experimental Mac touch-to-click

**Source implemented, but not yet validated on a physical MacBook or iPhone.** This is a local-network feasibility test, not a supported security-hardened remote desktop product. See Apple's [Accessibility trust API](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions) and [Quartz event posting](https://developer.apple.com/documentation/coregraphics/cgevent/post%28tap%3A%29).

## Safety boundaries

- The existing view-only streaming mode works **without** installing the Mac agent.
- To enable clicking, Mac Chrome must share the **entire screen** (not a window or tab), exactly **one Mac display** can be active, the iPhone must be paired, and the Mac user must explicitly click **Allow touch control (2 min)** after the phone requests it.
- The server must run on **your own Mac** with the agent binary path configured at launch. Only the host browser connected through Mac localhost can approve.
- The small Swift agent receives bounded click coordinates through its parent's **stdin**, never a network listener. It checks macOS Accessibility permission and one active display before reporting ready.
- The local host can **Revoke control**. Control also expires after two minutes, and is revoked if the host stops sharing, either peer disconnects, the session ends, or the native agent exits. Each new grant requires owner approval.
- Only left-click in the immersive phone viewer is implemented. When the Mac approves control, the iPhone viewer automatically takes over Safari's visible viewport. **Safari on iPhone does not provide reliable arbitrary-element OS-level fullscreen**, so browser chrome may remain visible. Rotate the iPhone to landscape (turn off Portrait Orientation Lock if necessary) for larger, more accurate taps. The viewer can also open a view-only expanded preview using **Expand desktop** or by tapping the preview. **Exit & revoke** closes control view and sends a revocation request. Picture-in-Picture stays **view-only**. No keyboard, text, drag, scroll, files, clipboard or unattended access.
- **Use only a trusted LAN with no port forwarding.** Accessibility permits powerful computer input; do not use real accounts, credentials, password managers, or sensitive apps in this alpha.

## Build and run on your Mac

1. Stop any existing FLOATDESK server using **Control + C** (leave SPECTRE's separate port 8787 alone). Update code and run tests:

   ```sh
   cd ~/FLOATDESK
   git pull --ff-only
   npm install
   npm test
   ```

2. Make sure Apple's Xcode Command Line Tools are installed (`xcode-select --install` if necessary). Build the input agent locally:

   ```sh
   mkdir -p build
   xcrun swiftc native/macos/FloatdeskAgent.swift -o build/floatdesk-macos-agent
   ```

   The compiled binary is local and ignored by Git. No compiled executable, signing key or password is committed.

3. In macOS **System Settings → Privacy & Security → Accessibility**, add or enable access for the exact local `build/floatdesk-macos-agent` binary if necessary. The native agent refuses to send any input until macOS trusts its process. You may need to relaunch FLOATDESK after changing permissions. Do not weaken macOS security settings.

4. Start the existing **trusted LAN HTTPS** server, explicitly opting into the agent:

   ```sh
   cd ~/FLOATDESK
   HOST=0.0.0.0 PORT=8788 \
   TLS_CERT_FILE=certs/lan.pem TLS_KEY_FILE=certs/lan-key.pem \
   FLOATDESK_AGENT_BIN="$PWD/build/floatdesk-macos-agent" npm start
   ```

5. Open **`https://localhost:8788` in Mac Chrome** and the same LAN-hosted FLOATDESK origin in iPhone Safari, with the existing trusted local CA. Create/pair a session; on Mac choose **Entire screen** when Chrome asks what to share.

6. Tap **Request Mac control** on the iPhone; the Mac owner may choose **Allow touch control (2 min)**, after which macOS Accessibility authorization is checked. **When control becomes active, the phone automatically opens the immersive desktop viewer.** Rotate the phone to landscape and tap a harmless target. Use **Exit & revoke** on the phone or **Revoke control** on the Mac to stop. If the status reports missing permission, check System Settings and retry.

## Physical acceptance checks

- [ ] iPhone receives whole-monitor live video and can request touch control.
- [ ] Tap before Mac approval is ignored by the host; an unpaired viewer cannot inject events.
- [ ] Mac owner deliberately approves, Accessibility check passes, and one test iPhone tap clicks a harmless visible Mac target.
- [ ] Coordinates remain correct with video letterboxing; black bars don't click.
- [ ] After Mac approval, the iPhone desktop automatically expands to use Safari's viewport; rotate to landscape and verify tap coordinates remain correct.
- [ ] **Exit & revoke** returns to the normal page and disables further remote input; verify no pairing change.
- [ ] Mac Revoke control immediately prevents further clicks.
- [ ] Stop sharing and End session disable control. Re-sharing requires new browser capture consent and a new explicit control approval.
- [ ] Disconnect iPhone Wi-Fi while approved: input stops. Reconnection must **not** silently re-enable remote input.
- [ ] Wait two minutes: control expires and must be approved again.
- [ ] Verify that without `FLOATDESK_AGENT_BIN`, all previous PiP/view-only features still work.
- [ ] Multi-monitor test must be denied, not silently mis-map clicks.

**Cleanup:** Disable the input agent's Accessibility permission when not testing. Remove the temporary iPhone development CA when local HTTPS tests are complete.

## Known limitations

A raw user-compiled Swift executable may have inconsistent macOS Accessibility identity across rebuilds. The security design, native binary compilation, system permission behavior, pointer coordinate orientation, performance and Safari touch interactions still need real-device verification. This does not provide hardened remote control or reliable unattended operation.
