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

## M8 native Mac host shell / service inventory

The research-only AppKit menu bar shell has **no network listener, no autostart, no remote-action capability and no embedded Node server**; its menu can open only the fixed `https://localhost:8788` dashboard. A browser on the Mac must still be paired and permissioned independently. A native service inventory is exposed only after local Mac host authentication and returns no executable paths, LAN IPs, signing credentials or tokens. File mode checks are merely informational: `configured` does NOT mean trusted code signing, verified parent directory permissions, Apple notarization or granted Accessibility/Files/TCC permissions. Do not use the CI ad hoc signature as a production trust identity. PiP is view-only and unaffected.

## M9 Mac-owned local research service

The native menu Start action can launch only an explicitly locally configured, trusted Node executable running the checkout's `src/server.js`, with `HOST=127.0.0.1` and `PORT=8789` and a scrubbed environment. No phone/API action starts it. The current implementation does NOT guarantee cleanup if the menu app crashes, prohibit all cross-app duplicate processes, verify signed binary identities, or prove stop acknowledgement. Use only as a **local development tool**. The existing TLS/HTTPS LAN server on port 8788 and its **view-only iPhone PiP** remain independently managed and untouched.

## M10 parent-bound local-only dashboard

The 8789 Mac research server now runs via `src/managed-host.js`, which rejects `HOST` other than `127.0.0.1`, `PORT` other than `8789`, or inherited TLS settings. The macOS app retains the parent pipe's write FD; EOF causes Node to exit after menu app death. Mac Stop/Quit also closes the write side and signals only its owned child `Process`. A phone cannot invoke service start/restart. **Not a hardened supervisor:** hung Node may ignore EOF, unmanaged competing instances could occupy the port, local malicious software could interfere, and neither signing nor OS trust is established. The standalone HTTPS 8788 PiP server is unaffected, view-only, and still requires Mac capture permission.

## M11 Mac-local configuration and advisory duplicate protection

Only a local Mac user can select the research checkout and Node executable through `NSOpenPanel`. The resulting two paths are stored in macOS UserDefaults; no phone messages, IP addresses, TLS private keys, pairing tokens or credentials are accepted/saved. A nonblocking file lock prevents cooperating instances of the menu app from managing the same loopback-only 8789 child concurrently, and is retained until that owned child exits. The lock is **advisory, not an authentication system**; it cannot stop hostile same-user software, a manually launched competing service, binary substitution, path races or deliberate lock-file tampering. macOS signing/notarization and robust process supervision remain required before production. None of these changes touch the independent 8788 trusted-LAN HTTPS/PiP service.

## M12 source snapshot and strict distribution guard

The Mac Host's local settings include a SHA-256 digest of the selected Node executable and all current root-level files of `src/`, `public/` and `package.json`. A missing or changed source blocks a new local **8789** launch until the Mac owner reapproves it, even if the user-selected paths are unchanged. Non-regular or symlinked source files are refused. This is **change detection, not trusted code identity**: it does not defend against a hostile same-user actor able to change code and settings, in-flight file substitution, unsafe dependency contents in `node_modules`, unsigned binaries, or active network attackers. The research-only HTTP 8789 server is kept separate from the LAN HTTPS 8788 PiP service.

The `scripts/verify-mac-release.sh` gate fails unless a reviewed Developer ID Application team signature, hardened runtime and Gatekeeper assessment are present. CI proves the existing ad-hoc-signed development `.app` cannot pass this gate. This is **not a notarization service**, does not acquire keys or sign artifacts, and passing does not imply full TCC/XPC security acceptance or device release approval.
