# FLOATDESK

**Your computer, always within reach.** An open-source experiment toward phone-first remote desktop with Picture-in-Picture (PiP), secure quick resumption, and natural touch interaction.

> **Status: trusted-LAN research prototype, not a secure remote-desktop product.**
> Screen streaming works without native software. An optional **Mac single-monitor touch-to-click alpha** now exists in source, but has **not** passed physical device tests. It requires deliberate local-host approval, fresh whole-screen sharing permission and macOS Accessibility authorization. No typing, dragging, native mobile app or unattended access.

## Why build it?

Most remote desktop clients prioritize a full-screen desktop shrunk onto a phone. FLOATDESK's proposed interaction is: watch the computer while using another phone app, tap the floating preview to return, then control the computer through direct-touch gestures without repeatedly logging in.

## Non-negotiable: Picture-in-Picture (PiP) remains core

**PiP must not be removed as FLOATDESK evolves into iPhone Mode.** Users need a live, floating, view-only Mac video window while using other iPhone apps, with a deliberate way to return to Desktop Mode or iPhone Mode without unnecessary re-pairing. The app's phone-native Files, Terminal and app launcher experiences complement the floating live viewer rather than replacing it. Capture always requires Mac-side permission; returning from PiP must not silently authorize touch control.

The existing Safari PiP feasibility was **user-reported on iPhone 16**. Native iOS PiP behavior, media suspension, return transitions and long-running reliability require separate physical tests, intentionally postponed by the owner. **Do not claim PiP is interactive inside iOS's floating window.** Keep the existing working PiP path until a native replacement is verified.

## What works in the prototype

- Minimal Node.js signaling service; no cloud account.
- Eight-character, expiring pairing codes and random 256-bit resume capabilities held in tab session storage.
- One host / one viewer, local browser screen capture, WebRTC peer-to-peer **view-only** video.
- Best-effort WebSocket reconnect and session resumption with negotiation-scoped ICE buffering (a lost media connection still needs renegotiation).
- Explicit **Stop sharing** host button (ends media and clears local preview but keeps pairing) versus **End session** (revokes the pairing), with browser capture consent requested again on each restart. The owner reported that this button worked on an iPhone 16.
- Explicit host capture-stop signaling so a viewer is not incorrectly told the host is still sharing.
- Browser Picture-in-Picture attempt with graceful unsupported/error feedback.
- A manual **Refresh video** action for authenticated viewers that asks the Mac host to renegotiate WebRTC video without issuing another pairing code while the authorized session is valid. Device validation of this recovery path is still pending.
- No screen recordings and no server-side handling of captured media.
- Experimental macOS **tap-to-click** input is disabled unless the Mac owner compiles the Swift agent and explicitly enables it at server launch. Even then, each request needs a separate, expiring 2-minute Mac-local approval. See [M2 setup and safety](docs/M2-TOUCH-CONTROL.md).
- The iPhone viewer automatically expands to a **viewport-filling desktop control view** after approval; it includes **Exit & revoke** and also supports manual **Expand desktop**. This is a CSS immersive layout, **not guaranteed OS-level fullscreen** on iPhone Safari. Turn the phone sideways for larger taps; PiP remains view-only. Device acceptance pending.

**M2 device update (2026-10-26):** The owner confirmed Exit & revoke works and phone-to-Mac touch positions are accurate after the corrective build. A follow-up adjustment restores an **automatic, low-refresh Mac whole-screen preview** (with Pause/Resume), reserves a dedicated top control strip on the phone so no part of the remote desktop is covered in landscape, and removes the temporary tap marker. These newest UI changes require device verification; streaming and long-term security are still experimental. See [M2 diagnostics](docs/M2-TOUCH-CONTROL.md) and [issue #16](https://github.com/damxntheman/FLOATDESK/issues/16).

## M3: iPhone Mode Mac app launcher (experimental)

A paired iPhone can now request a **separate, five-minute Mac-approved capability** to browse names of installed Mac apps and launch them from touch-friendly cards. **Screen streaming is not required** for listing/launching. This is a native-feeling Safari interface, not a native iOS application or a universal macOS app converter. See [M3 device checks](docs/M3-IPHONE-MODE.md).

## M4: App Experiences + phone-friendly Terminal Preview

In the next research increment, Apple's built-in Terminal app tile opens a **phone-native, mouse-free preview** instead of immediately launching a desktop window. The preview shows genuine, read-only Mac diagnostics with a separate **three-minute Mac approval**: `help`, `date`, `uptime` and `system`. This is **not a real shell**: no `ls`, `cd`, `git`, scripts, files or arbitrary commands execute. Other applications still use the desktop launcher fallback. Read-only Files Mode path-containment code is implemented **only as an internal module**, with no network API or filesystem permission until an owner-operated native folder picker is designed. See [M4 scope](docs/M4-APP-EXPERIENCES.md). Physical testing remains **deferred at owner request**.

## M5: Files Mode (experimental, hardware tests deferred)

Tapping a supported **Finder** tile now opens a phone-friendly, **read-only Files** screen. The paired phone can ask the **Mac owner to select a specific folder using a native `NSOpenPanel` helper** (a separately compiled, opt-in Swift binary). Only names of folders and files are returned; no file contents, transfers, modifications or arbitrary phone paths. Access expires after five minutes, independently of app/Terminal/mouse permissions. **Native picker, sandbox and TCC access are not yet validated on a physical Mac.** See [M5 scope and device gates](docs/M5-FILES-MODE.md).

## M6: native Mac companion architecture handshake

A separate, **opt-in Mac-native Swift probe** and a fail-closed Node process bridge now agree on a versioned, local-only handshake. The Mac owner can click **Check companion readiness** in Chrome to verify the bridge is reachable. It currently reports **zero privileged capabilities**: no native capture, input, file access, terminal or native iOS PiP. All previously implemented browser Desktop Mode, **view-only PiP**, app launcher, Terminal Preview and Files Mode paths remain unchanged. Swift compilation and device permission behavior are **not physically verified**. See [M6 architecture and safe opt-in](docs/M6-NATIVE-COMPANION.md).

## M7: native Files broker (opt-in research alpha)

A new native macOS broker performs folder selection AND read-only directory enumeration in one process. The Mac owner's selected directory remains private inside the helper, which uses file-descriptor-relative traversal to prevent symlink escapes. The phone receives authorized file/folder names only, never content or full Mac paths. Set FLOATDESK_NATIVE_FILES_BIN explicitly to opt in; M5 otherwise remains. GitHub macOS CI compiles the Swift service and tests its directory-safety behavior, but GUI selection and physical iPhone use remain unverified. See [M7 scope](docs/M7-NATIVE-FILES-BROKER.md).

**PiP remains a core FLOATDESK experience.** This native Files helper does not replace existing browser PiP, Desktop Mode or Terminal Preview.

## M8: Mac menu bar host shell and local capability status

M8 adds a minimal macOS **FLOATDESK Mac Host.app** menu bar shell that opens the existing **local** Mac dashboard; it does **not** start the Node service, request screen control, install a login item, capture video or replace the viewer. Build with `bash scripts/build-mac-host.sh`; CI tests Swift compilation, bundle structure and **ad hoc** signature validity (not Developer ID/notarization). A **Mac-only native service inventory** shows which optional helpers are configured, without returning local paths or granting permissions. See [M8 technical notes](docs/M8-MAC-HOST-SHELL.md).

**iPhone PiP remains permanently supported** alongside Desktop Mode and iPhone Mode. The owner is continuing software development **without physical testing for now**.

## Local smoke test (desktop only)

Requirements: Node.js 20+, two modern browsers or tabs.

```sh
git clone https://github.com/damxntheman/FLOATDESK.git
cd FLOATDESK
npm install
npm test
npm start
```

Open `http://127.0.0.1:8787` twice on the same computer. On one tab choose **Create a session**, on the other enter the code and choose **Connect**. Back on the host tab choose **Share screen**, grant browser consent, and select a display or window. The viewer should receive the video. The **Try Picture-in-Picture** button is experimental.

If port 8787 is already occupied, use `PORT=8788 npm start` and open `http://127.0.0.1:8788`.

**2026-10-26 user-reported evidence:** FLOATDESK live video worked in two Mac Chrome tabs, and Mac PiP stayed live while switching apps. The iPhone 16's floating PiP also remained live while WhatsApp was open. One roughly 10-second Wi-Fi interruption recovered live video automatically without a new pairing code; Chrome capture revocation and renewed window selection also preserved pairing. These are user-reported single-device tests, **not** a general reliability guarantee; see [test evidence](docs/TESTING.md).

A browser refresh of the host **ends screen capture**. This is an operating-system permission boundary, not a feature we will silently bypass.

## Phone / LAN experiment

The server intentionally defaults to loopback-only. To bind to your LAN, you **must configure HTTPS** with a certificate trusted by **both** your Mac and phone. Self-signed/untrusted certificates may prevent mobile WebSocket and WebRTC behaviors. For example, with `mkcert`, generate a development certificate containing the actual LAN address, and install/trust the development CA on the test phone only if you understand the security implications:

```sh
# Enter your actual LAN address locally; do not commit it to GitHub.
printf 'Mac LAN IPv4 address: '; read -r MAC_LAN_IP
mkcert -install
mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem localhost 127.0.0.1 "$MAC_LAN_IP"
HOST=0.0.0.0 TLS_CERT_FILE=certs/lan.pem TLS_KEY_FILE=certs/lan-key.pem npm start
```

Then visit `https://<YOUR-MAC-LAN-IP>:8787` from the phone, and `https://localhost:8787` on the computer. Certs are ignored by Git; **never commit the CA private key or TLS keys**. Test only on a trusted LAN. No STUN/TURN servers are configured; peers may fail on isolated guest Wi-Fi, carrier networks, or restrictive firewalls.

**Privacy note:** The LAN IP previously shown here was only an illustrative example, not a user-specific address. Avoid committing personal LAN/public IPs, pairing codes, session tokens, CA private keys, TLS private keys, or logs revealing sensitive network information. Git history retains old generic examples; removing current examples is documentation hygiene, not a security incident.

**Do not port-forward or expose this prototype publicly.** It has no production hardening, user accounts, end-to-end authenticated identity verification, safe input-control permission model, or external threat mitigation.

## Architecture and priorities

See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [security](SECURITY.md), and the [device validation plan](docs/TESTING.md).

The longer-term product should use a separately authorized native desktop agent and native iOS/Android clients. We will not conflate a browser PiP experiment with proven native PiP background behavior or promise touch control inside a floating PiP window.

## Contributing and license

We welcome issues and focused pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE). Dependencies remain subject to their own licenses.
