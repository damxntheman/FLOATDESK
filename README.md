# FLOATDESK

**Your computer, always within reach.** An open-source experiment toward phone-first remote desktop with Picture-in-Picture (PiP), secure quick resumption, and natural touch interaction.

> **Status: trusted-LAN research prototype, not a secure remote-desktop product.**
> Screen streaming works without native software. An optional **Mac single-monitor touch-to-click alpha** now exists in source, but has **not** passed physical device tests. It requires deliberate local-host approval, fresh whole-screen sharing permission and macOS Accessibility authorization. No typing, dragging, native mobile app or unattended access.

## Why build it?

Most remote desktop clients prioritize a full-screen desktop shrunk onto a phone. FLOATDESK's proposed interaction is: watch the computer while using another phone app, tap the floating preview to return, then control the computer through direct-touch gestures without repeatedly logging in.

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
# Example: replace 192.168.1.20 with your computer's real LAN address.
mkcert -install
mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem localhost 127.0.0.1 192.168.1.20
HOST=0.0.0.0 TLS_CERT_FILE=certs/lan.pem TLS_KEY_FILE=certs/lan-key.pem npm start
```

Then visit `https://192.168.1.20:8787` from the phone, and `https://localhost:8787` on the computer. Certs are ignored by Git; **never commit the CA private key or TLS keys**. Test only on a trusted LAN. No STUN/TURN servers are configured; peers may fail on isolated guest Wi-Fi, carrier networks, or restrictive firewalls.

**Do not port-forward or expose this prototype publicly.** It has no production hardening, user accounts, end-to-end authenticated identity verification, safe input-control permission model, or external threat mitigation.

## Architecture and priorities

See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [security](SECURITY.md), and the [device validation plan](docs/TESTING.md).

The longer-term product should use a separately authorized native desktop agent and native iOS/Android clients. We will not conflate a browser PiP experiment with proven native PiP background behavior or promise touch control inside a floating PiP window.

## Contributing and license

We welcome issues and focused pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE). Dependencies remain subject to their own licenses.
