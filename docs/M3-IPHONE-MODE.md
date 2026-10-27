# M3: FLOATDESK iPhone Mode — Mac app launcher

**Status:** Source implemented; physical MacBook M1 + iPhone 16 validation **pending**. This is an iPhone-native-feeling Safari interface connected to a Mac app launcher, not a native iOS app, a generic macOS-to-iOS app converter, or an internet remote-control product.

## Capabilities

- The same local pairing opens **iPhone Mode** on the viewer's Safari, independently of screen capture.
- The phone requests **Mac app access**. The Mac owner explicitly approves by clicking **Allow Mac apps (5 min)** in the localhost Chrome host UI within 30 seconds. Neither app listing nor app launching is allowed merely by knowing the pairing code.
- The Mac enumerates top-level application bundles in standard folders: /Applications, /System/Applications, /System/Applications/Utilities, ~/Applications, plus the known Finder path at /System/Library/CoreServices/Finder.app.
- The phone receives **only an opaque app ID and display name**, never an executable path. An app tile triggers a request with the ID; the Mac checks it against a new local catalog and runs /usr/bin/open with a verified app bundle path, **without shell interpretation**.
- The phone can launch/activate that app **on the Mac**. The app does not run on the phone and does not yet acquire a custom phone-native control panel. **Desktop Mode** remains the fallback for interacting with the application's Mac UI.
- App permission lasts five minutes and is separately revocable by either paired device. It ends on disconnect, session end or expiry. Launch requests are rate-limited. Touch-control permission is entirely separate.

## Owner hardware test (trusted LAN, no public exposure)

1. Revoke any active remote-control and app-access grants. Stop the current FLOATDESK server using Control+C.
2. In Mac Terminal update the repository and run its tests:

        cd ~/FLOATDESK
        git pull --ff-only
        npm test

3. Restart the existing HTTPS server on **port 8788** (do not use SPECTRE's 8787). Retain the optional existing Swift touch-control agent if desired:

        HOST=0.0.0.0 PORT=8788 TLS_CERT_FILE=certs/lan.pem TLS_KEY_FILE=certs/lan-key.pem FLOATDESK_AGENT_BIN="$PWD/build/floatdesk-macos-agent" npm start

4. Open https://localhost:8788 on Mac Chrome, create a session, and pair iPhone Safari using the existing trusted local HTTPS Mac address.
5. In the phone's **iPhone Mode**, tap **Request app access**. Confirm the Mac displays an enabled **Allow Mac apps (5 min)** button and approve locally. The app tiles should populate without requiring a screen share.
6. Tap **Finder** on the phone. Verify Finder opens/activates on the physical Mac. A success status means macOS accepted the launch request, not necessarily that its window became foreground; verify visually.
7. Test **Disconnect app access** and **Revoke app access**. Both should immediately clear the app grid and prevent further app listing or launch, preserving the pairing.
8. Separately start screen sharing and tap **Open desktop view** to confirm it returns to the familiar read-only enlarged desktop without silently granting mouse input.

## Physical acceptance (not passed by CI)

- [ ] Paired viewer must obtain an explicit local Mac approval before app names or launches become available.
- [ ] Real installed Mac apps appear, including Finder.
- [ ] Tapping Finder from iPhone opens/activates the real Mac Finder.
- [ ] Both phone and Mac revocation disable launches; expired permission is not silently extended.
- [ ] Disconnect/resume does not preserve action permission.
- [ ] No regression to Desktop Mode, Mac thumbnail preview, landscape Exit & revoke, PiP, or mouse-click accuracy.
- [ ] Running npm test succeeds on the real Mac.

## Future proof points

**Files Mode:** Build an iPhone-style mobile browser for explicitly selected Mac folders, read-only first, with a separate authorization boundary. Do not treat app access as filesystem access.

**App-aware mode:** Discover supported app/window actions through stable Mac APIs, preserving a Desktop Mode fallback for apps without reliable integrations.

**Native performance:** Compare measured latency with the current WebRTC browser baseline before attempting a native Mac ScreenCaptureKit / VideoToolbox companion and native iPhone frontend. Do not promise a native experience until real devices verify it.
