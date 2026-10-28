# M10 — Parent-bound Mac local dashboard and crash recovery

**Status:** Research implementation with automated Node/macOS CI. Physical MacBook M1 and iPhone 16 tests remain deferred.

## Why

M9 explicitly started a loopback-only Node service, but on a menu-bar process crash the child could outlive its owner. FLOATDESK's long-term product requires predictably bounded service lifetime, especially before introducing native permissions. This milestone handles that research failure mode without automatically starting or replacing our **separate HTTPS 8788 Safari/PiP stream**.

## Behavior

- The Mac menu's explicit Start uses the trusted checkout's `src/managed-host.js`, not the raw browser server.
- A Swift `Pipe` is attached to the child stdin. The Mac parent keeps the write end open until Stop, Quit or process termination. The managed wrapper subscribes to stdin **EOF/close/error** *before* importing the server and exits once ownership is lost.
- The wrapper strictly requires `HOST=127.0.0.1`, `PORT=8789`, and no TLS key/certificate variables. The Mac parent supplies these through a freshly controlled environment with no native-helper flags or inherited secrets.
- Normal Stop/Quit closes the pipe and also requests termination of the child Process, without consulting arbitrary PID files. An abnormal Mac process death closes parent-owned file descriptors, which triggers the child EOF shutdown.
- No persistent daemon, auto-restart, launch item, remote app start command, new OS permission or hidden network listener is added.

**Separation:** port **8789** is Mac-local research HTTP. Port **8788** remains the existing independently started trusted LAN HTTPS/WebRTC server used for iPhone Desktop Mode, floating view-only **PiP**, Terminal Preview and Files. No changes to the latter's capture or pairing code are introduced by M10.

## Automated acceptance

Node tests spawn the managed wrapper under invalid host/TLS/port configurations and require refusal. They also ensure a correctly configured process exits when its stdin owner pipe closes.

macOS CI compiles the full native menu shell, runs M9's explicit Swift start/stop smoke, then runs `FloatdeskLocalServiceSmoke.swift --simulate-owner-death`, which launches a live loopback server, verifies it responds and calls `_exit(0)` without cleanup. The CI runner then polls until the local port is closed. Existing M7 native Files and all PiP/remote-viewer regression tests remain in CI.

## Limitations and future hardening

- This is not the same as process-group supervision. If Node freezes before handling EOF, the process might persist. A signed native service manager and OS-supported process lifetime policy still need review.
- An unrelated process could bind 8789 first; we haven't implemented exclusive launch coordination across Mac app copies.
- Closing owner pipe triggers a fast Node `process.exit()` and is acceptable for this unprivileged ephemeral research child. A future service with live permissions and user data needs a graceful drain/revoke protocol, bounded shutdown acknowledgments, and reliable kill escalation.
- No real Mac TCC, signing, notarization, login-item policy or PiP-background behavior has been verified.
- Production native service distribution needs Astra-grade architecture review at an appropriate handoff point. All M10 work here was authored **in this ChatGPT conversation**, not by Astra or Opus.

## Deferred device gates

- [ ] Confirm actual Mac menu Start, Stop, Quit and intentional crash release the child.
- [ ] Confirm no service on an external interface, and no reused/spoofed local services.
- [ ] Confirm process conflict/restart behavior after owner exits and port 8789 becomes available.
- [ ] Confirm separate HTTPS port 8788 and iPhone PiP remain available after Mac Host crash and restart.
- [ ] Confirm no unauthorized service start, Mac permission grants, file mutations or shell execution.
- [ ] Investigate proper signing, sandbox/TCC/XPC and robust native process supervision before shipping.

**Model routing:** Continue implementing here. Recommend **Astra** explicitly when production-grade macOS signing, process supervision and TCC/XPC security are next; recommend **Opus** for the major iPhone frontend redesign. Neither model has worked on this branch.
