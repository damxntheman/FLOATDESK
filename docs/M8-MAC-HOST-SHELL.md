# M8 — FLOATDESK Mac Host shell and local service inventory

**Status:** Source and automated CI only. Physical MacBook M1 / iPhone 16 tests remain deferred by owner request.

## Why

FLOATDESK's long-term vision needs a trustworthy, user-visible native Mac companion, not an indefinitely extended Chrome/Node prototype. M8 introduces the **first minimal app shell** without silently migrating working desktop video/PiP or any privileged Mac operation.

## What is implemented

- **Mac menu bar shell:** An AppKit `LSUIElement` app appears in the menu bar as FLOATDESK, with the single active operation **Open Mac control dashboard**. It opens exactly `https://localhost:8788` in the default browser. It does not run the Node server, open ports, act as a login item, control the mouse, read folders, or record the screen. Quitting the shell does not stop a separately running Node server.
- **Local native status:** The existing authenticated Mac host page has **Inspect Mac native services**. The server returns a sanitized inventory of four opt-in binaries (native Files broker, legacy folder picker, touch agent, companion handshake). Each is classified as disabled, missing, invalid, unsupported or configured. No actual Mac paths, device names, local IPs or credentials are returned. The paired phone and unpaired clients cannot request this inventory.
- **Research packaging:** `scripts/build-mac-host.sh` compiles `native/macos/FloatdeskMacHost.swift` into `FLOATDESK Mac Host.app` with `MacHost-Info.plist`. CI can ad hoc sign the development bundle and verify the plist. This is **not** a Developer ID-signed, hardened runtime, notarized, distributed application.
- **No new permission grants:** M2 click, M3 launch, M4 Terminal Preview, M7 Files and the browser capture permission remain separate. Existing iPhone PiP stays view-only and is not dependent on this native shell.

## Architecture & limitations

The menu bar shell is a starting point for native process management, **not** the process manager yet. Future integration must prevent conflicting listeners on 8788, isolate the authenticated host's control channel from LAN clients, and preserve capture-stop/explicit-consent behavior. An informational check of executable file type/mode does not verify cryptographic signature identity, ownership of containing directories, sandbox privileges or App Store rules.

The default Mac URL is `https://localhost:8788` because the current test installation uses HTTPS on that port. When the browser server is not running, the menu button opens a browser page that cannot connect; this is expected. There is no automatic server startup or background monitor.

## Automated checks

GitHub CI:
- Node unit/integration suite, including Mac-local-only status and PiP preservation regressions.
- Existing macOS native Files broker compilation and safe-traversal fixture checks.
- New macOS job compiles the menu-bar bundle, validates metadata, ad hoc signs the build, and verifies the signature structure. This is packaging evidence, **not permission or device acceptance**.

## Later device gates — deliberately not requested now

- [ ] Build and open menu bar app on MacBook M1; verify visible icon, menu actions, no dock window and quit.
- [ ] Clicking Open dashboard only opens localhost and does not start a new Node server or auto-authorize a phone.
- [ ] Inspect Native Services in Mac Chrome; confirm all disabled/missing/configured states and no sensitive data disclosure.
- [ ] On iPhone, verify service inventory is unavailable; permissions remain per-capability.
- [ ] PiP continues to show Mac desktop while another iPhone app is foreground; return to desktop and capture-stop privacy remain correct.
- [ ] M7 Files picker and M4 Terminal Preview work independently; no new filesystem scope leaks.
- [ ] Establish code-signing identity, notarization, TCC sandbox/entitlement and process lifecycle strategy before installer or background daemon.

## Next model & engineering scope

Use **Astra** for designing a signed Mac host app with explicit lifecycle ownership of local services and capability-specific permissions. Use **Opus** for the later full-screen iPhone Mode visual revamp. Do not replace browser PiP until a native iPhone viewer is physically verified.
