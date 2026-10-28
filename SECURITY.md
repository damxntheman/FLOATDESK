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

## M3 Mac application action boundary

M3 is **not a general remote command executor**. The phone may request Mac-owner approval to list installed application names and launch a chosen app by an opaque ID matched to a fresh local catalog. The host approves only through a Mac localhost browser session. The permission is independent of touch control and revokes on disconnect, session stop, or expiry. Mac executable paths, shell access and file contents are never disclosed by this feature. Mac launches use /usr/bin/open and verified bundle paths without shell evaluation. App launching still runs software on your Mac, so use only with trusted devices on a trusted LAN. No internet port forwarding.

## M4 read-only Terminal Preview and Files groundwork

A Terminal.app tile uses a **distinct Mac-local approval**, for three minutes, to request allowlisted read-only diagnostics only: help, date, uptime, system. It does **not** spawn `sh`, `bash`, `zsh`, `osascript`, or any PTY, and cannot run arbitrary commands. The preview grants no file access or remote input rights and revokes on disconnect, stop, expiry or explicit revoke. Phone output uses text-only DOM insertion with bounded output.

The Files Mode directory helper is **not reachable from signaling**. It contains only a safe, read-only metadata scanner for a future *Mac-owner-selected folder*. It rejects absolute phone paths, traversal and symlinks, and hides dotfiles. Do not expose any Files API, permit a remote path selector, or add mutations until a local Mac picker, independent approval and physical tests are completed.

## M5 read-only folder metadata access

M5 is explicitly disabled without an opt-in **native Mac folder picker binary**. The paired phone requests a folder scope but cannot choose or supply the path; the Mac owner must select a specific folder through a local `NSOpenPanel` and may revoke instantly. Only names and folder/file types (not contents or full paths) are transmitted, and the scope expires after five minutes. `src/files-policy.js` rejects parent traversal, hidden segments and symbolic link paths; listings are bounded. 

The selection helper is separate from Node; it does **not** transfer App Sandbox bookmarks or guarantee Node's access to TCC-protected folders. Current JS path containment is not hardened against active filesystem race/symlink swaps. Do not browse sensitive folders, use an untrusted phone, or expose this prototype outside a trusted LAN. See [M5 limitations](docs/M5-FILES-MODE.md).

## Privacy of local network configuration

A private IPv4 address (for example, a generic `192.168.x.x` home-network address) is not directly internet-routable and is not an authentication secret. Nevertheless, do not commit actual personal LAN or public IP addresses, local device names tied to a person, session codes, pairing/resume tokens, root CA private keys, TLS keys or sensitive connection logs to the public repository. Use placeholders in public instructions. **Never port-forward this research prototype or use it on an untrusted network.**

## M6 native companion handshake — no privileges

The optional Swift helper implements only a versioned, fixed, **unprivileged hello** protocol. It cannot capture screens, send input, access files, launch applications or execute shells. The server may spawn it **only for a local authenticated Mac owner request**, using a configured absolute path; no phone-provided path or command is forwarded. Responses must match request IDs and the exact all-false capability structure. Processes time out, fail closed and do not log local paths. In production, a signed native Mac app, XPC/sandbox/TCC design, per-capability host consent, hardened process lifetime, IPC authentication and physical security review are still required.

**PiP privacy boundary:** floating iPhone PiP is view-only and must never imply permission to click, run Terminal commands or browse files. Mac screen capture must continue requiring explicit consent; stopping capture must stop viewer media. Do not replace the currently reported working PiP flow until a native iPhone replacement is physically validated.

## M7 native read-only Files service

The opt-in native Files helper now keeps Mac owner folder selection and directory listing inside one process. It holds a directory FD and opens nested folders relative to it using O_NOFOLLOW, avoiding path-check/symlink race escapes. The Node server does not see the chosen absolute root path. The helper cannot expose file contents, modify files or run scripts via its protocol. A separate Mac-local approval and five-minute grant still apply. On revoke, disconnect or process death, the native helper is killed and its file descriptors close. This is still a LAN-only, unsigned research prototype; real macOS TCC, App Sandbox and signed distribution remain unverified. Legacy M5 folder-picker/Node reader is retained only as an opt-in compatibility fallback. Floating PiP remains independent and view-only.
