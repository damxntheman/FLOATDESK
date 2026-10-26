# Security policy

**FLOATDESK v0.1 is an experimental local-only research preview, not suitable for internet exposure or sensitive remote administration.**

Report vulnerabilities privately through GitHub's private vulnerability reporting feature if enabled, or contact the repository maintainer through a private channel. Do not publish live exploits, tokens, recordings, or personally identifying screen contents in issues.

## Current protections

- Loopback is the default; non-loopback listener requires a TLS certificate/key.
- WebSocket Origin is checked.
- Viewer pairing is short-lived and pairing attempts are rate-limited per remote IP.
- Session resume uses an unpredictable per-role capability, held in tab session storage.
- Each room supports only one viewer; the viewer cannot send input events.
- Browser consent is required for each new display-capture session; no capture is saved on the server.

## Known limitations

- A phone/browser may suspend or stop WebRTC while backgrounded, even if pairing survives.
- No authenticated desktop identity, device approval history, relay infrastructure, verified encrypted file transfer, persistent auditing, or operating-system input permission workflow exists.
- TLS is transport protection for signaling; a trusted local certificate must be provisioned for LAN use.
- The signaling protocol has basic throttling but is not security reviewed. The server can see pairing and signaling metadata, but not decoded WebRTC video.
- This prototype cannot promise connection survival after a desktop host browser reload, capture revocation, lock screen, or OS sleep.
- WebRTC uses browser security and encrypted media transport, but our prototype's pairing model is not a complete, independently reviewed identity system.

Never use this preview to control someone else's computer or capture their screen without explicit authorization.
