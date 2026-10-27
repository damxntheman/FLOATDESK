# M4 — App Experience Engine and phone-native Terminal Preview

**Status:** Code and CI work only. User requested that physical MacBook/iPhone tests be deferred. M3 Mac app launcher hardware acceptance is also still pending.

## Goal

FLOATDESK must not blindly render every desktop window on the phone. Its App Experience Engine decides between supported phone-native interaction and a trustworthy Desktop Mode fallback. A catalog `experience` field is **UI metadata, not a permission token**.

## Terminal experience, phase A: Read-only Preview

The canonical macOS Terminal bundle opens a dedicated phone-friendly view in Safari, with tappable commands and an input form that uses the iPhone keyboard. Once the Mac owner explicitly approves a **separate 3-minute Terminal Preview grant**, commands `help`, `date`, `uptime` and `system` return real Mac diagnostics. Status, revocation and output cleanup appear within the viewer.

**This is NOT a true terminal**. There is no PTY, shell process, editable working directory, file operations, script execution or connection to existing Terminal.app tabs. Commands like `git status`, `ls`, `cd`, `rm` and `sudo` are intentionally rejected. We do not treat M3's "Allow Mac apps" grant as permission to run terminal commands. Clicking Terminal.app outside the canonical location still uses normal desktop fallback.

Protocol: `terminal-request` (authenticated phone) → `terminal-approve` (only Mac host via localhost) → `terminal-state:active` → `terminal-command` (allowlisted) → `terminal-output`. `terminal-revoke` is available to both authenticated devices; permission expires after 3 minutes and is revoked on device disconnect, socket replacement and session end. A pending request expires after 30 seconds. The Mac host never accepts a remotely supplied command path/executable.

### Future real terminal (requires independent design + hardware review)

- Use a native macOS PTY host process with explicit owner approval, short lifetime, per-session ownership and kill-on-disconnect.
- Ensure cancellation and process-tree cleanup, bounded output, backpressure, large-paste warnings and no credential leakage through logs.
- Decide secure token/PTY lifecycle, app sandbox and signing constraints, shell environment restrictions and user education. **Never silently enable a real shell as part of this preview**.
- iOS terminal control should preserve keyboard shortcuts, selection, IME input and reliable reconnect semantics without opening remote shells unattended.

## Files Mode groundwork

`src/files-policy.js` is currently an **unexposed** pure read-only directory listing helper. It requires a future explicit Mac-owner-selected absolute folder root; it does not choose one. It rejects `../`, hidden path traversal, symlinks and non-directory targets; returns limited, named folder/file metadata without file bodies. There is **no WebSocket route** to this module and no filesystem picker yet.

Future Files Mode should require a native folder picker, separate file-grant capability, realpath and inode safety/race controls, and proof that no files outside the selected root can be opened. Writes/moves/deletes need their own confirmation and recovery design.

## Deferred device gate

When the user decides to resume hardware tests:

- [ ] Verify M3 owner approval / Finder app launch on Mac (still pending).
- [ ] Verify Terminal tile opens the **phone-native** preview, not the Mac desktop.
- [ ] Verify every command is denied until separate Mac-local Terminal Preview approval.
- [ ] Verify four allowlisted commands show correct **Mac** diagnostics.
- [ ] Verify arbitrary shell syntax and unknown commands cannot execute.
- [ ] Verify revoke, expiry, disconnect and pairing resume disable and clear terminal output.
- [ ] Verify Mac's desktop, PiP, host preview and landscape exit remain functional.
- [ ] Do not test Files Mode remotely until a native folder picker exists.
- [ ] Do not mark real shell support accepted; it has NOT been implemented.

**Model selection:** Astra for Mac companion architecture, integration and security; Opus for the later iPhone-native UX revamp. Do not prematurely replace existing M2/Desktop Mode functionality.
