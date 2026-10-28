# M9 — Explicit Mac local service lifecycle

**Status:** 56/56 Node tests passed; macOS GitHub CI compiled the native menu shell and exercised a real local Node start/stop smoke test. Physical MacBook M1/iPhone 16 tests remain deferred at owner request.

## What changed

The `FLOATDESK Mac Host.app` menu bar shell now has **Start local dashboard (loopback only)**, **Stop managed local dashboard** and **Open managed local dashboard**. These actions manage only a direct child that this menu instance launched. A Start requires both `FLOATDESK_REPO_ROOT` (a trusted checkout) and `FLOATDESK_NODE_BIN` (an explicitly selected Node binary) in the Mac app environment. No startup at login, remote action, automatic restart, new OS permission, Shell execution from the phone or arbitrary PID kill is added.

The managed experiment uses **HTTP 127.0.0.1:8789**. It is usable on the Mac only. The existing separately configured **HTTPS LAN 8788** server remains independent and continues to provide the browser-based iPhone view and PiP. **Do not confuse the local research dashboard with a phone-facing production Mac service.**

The menu child environment is scrubbed to `HOME`, a basic `PATH`, `NODE_ENV=development`, `HOST=127.0.0.1` and `PORT=8789`. It doesn't inherit TLS private-key or optional native-agent environment values. Start refuses to run without an existing trusted checkout and executable Node path; a second Start while the owned child is active is refused.

## Limits

This is an **unsigned/ad hoc signed research app**, not a production supervisor. A Mac app crash can orphan the Node child; Stop currently requests termination but doesn't guarantee a verified shutdown across failures. Another app or another menu instance might already occupy port 8789, and source/binary paths are trusted user-selected inputs, not cryptographically verified identities. Proper code signing, notarization, cross-instance locking, process group shutdown, app sandbox/TCC and an authenticated native configuration UI are future work. Opening via Finder may not inherit Terminal environment variables; we have not verified real Mac GUI configuration.

## Deferred hardware gate

- [ ] On MacBook M1, configure a trusted local checkout and Node, then verify native menu Start/Stop/Open.
- [ ] Verify no automatic startup and no listener on other interfaces.
- [ ] Verify port-occupied and crash/orphan scenarios before enabling production supervisor behavior.
- [ ] Confirm only the owned child is stopped; separately running HTTPS port 8788 is unaffected.
- [ ] Confirm previous pairing, Desktop Mode, PiP while another iPhone app is foreground, capture-stop privacy, touch grants, app launcher, Files and Terminal Preview still work.
- [ ] Evaluate signed Mac host and native permission model with real devices.

**Model handoff rule:** We're coding in this ChatGPT conversation. The assistant will explicitly recommend **Astra** when deeper macOS code signing, XPC/TCC or full native architecture review is genuinely due; **Opus** when a full iPhone Mode UX overhaul is due. No handoff happens automatically.
