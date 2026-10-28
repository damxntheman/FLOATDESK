# M12 — Local integrity preflight and production-release gate

**Status:** Development work authored in this GPT-6 conversation. Not authored by Astra or Opus. GitHub macOS and Node CI are the validation source; no owner MacBook M1/iPhone 16 tests have been requested or accepted.

## Why

FLOATDESK's M11 research Mac menu remembers a selected project checkout and Node executable. Those path selections can continue pointing to files that have changed since the Mac owner first approved them. M12 records a fresh local snapshot when the owner explicitly configures the research service, then refuses to start the *Mac-only* managed instance if its configuration differs. It also ensures our ad-hoc development bundle is not accidentally promoted as a production Mac installer.

## Change detection design

`native/macos/FloatdeskSourceSeal.swift` computes SHA-256 in bounded chunks over a canonical selected Node executable; `package.json`; and all current top-level files in `src/` (server modules) and `public/` (browser/iPhone UI). The manifest includes file names and bytes, so adding/removing a file changes the seal. Files that aren't regular files, have unsafe world/group-write modes, are symlinks or are unexpectedly large are rejected. Nested source directories are intentionally unsupported in this research policy; approval must be redesigned if source becomes nested.

`FloatdeskHostSettings.swift` persists two owner-selected paths plus the *local* SHA digest in macOS UserDefaults. A cancelled GUI selection never replaces prior approval. When the owner clicks **Start local dashboard**, `FloatdeskLocalService.swift` first acquires its existing advisory single-instance lock, then computes and compares the snapshot before launching the child. If it has changed, Mac Host refuses the launch and tells the owner to use **Configure local dashboard…** again. The separate HTTP loopback port 8789 remains the *only* managed instance. This never enables external listeners, automatic starts, Terminal shells, Files writes, native capture or touch.

### Limitations (security-critical)

SHA-256 source comparison is **not cryptographic software provenance** because the hash, selected paths and unsigned program live under the same Mac user's control. Same-user malicious software, preexisting compromised modules, dependency changes in `node_modules`, runtime process injection, source swaps after the check, or arbitrary code inside a preapproved Node executable are NOT solved by this milestone. A freeze during hashing may delay the menu since these are synchronous research-only checks; real hardware performance needs measurement.

A production implementation needs Developer ID signing of the actual app and helper(s), entitlements/hardened runtime review, XPC or equivalent audited capability separation, trustworthy service identity, signing/notarization workflow and independent security/device review. Avoid treating M12 as such a production implementation.

## Production-release gate

`scripts/verify-mac-release.sh` refuses release when no reviewed Team ID is supplied, when Developer ID Application signature identity does not match, when hardened runtime flags are missing or when the macOS Gatekeeper assessment fails. It **never signs code**, reads credentials or performs notarization; passing its checks is necessary but not sufficient for a future release.

For CI, run it against the **ad-hoc signed research bundle** with a synthetic nonsecret Team ID and assert it **fails**. This verifies the release boundary is intentionally closed until the real Apple Developer signing/notarization process exists.

## Automated CI coverage

- Swift AppKit menu bundle and existing native Files build, signed for CI research only.
- Headless Swift source mutation fixtures: baseline matching digest, changed `src/app-access.js`, changed `public/index.html`, and newly introduced `src/new-module.js` all invalidate old approval.
- Local settings save/clear and existing lock/process crash cleanup.
- Node regression tests ensuring working browser PiP and existing iPhone Mode are untouched.

## Deferred Mac/iPhone acceptance

- [ ] On MacBook M1, GUI setup reapproval after changing/pulling project sources is discoverable and usable, including acceptable hashing latency.
- [ ] Changed/missing files and changed Node binary block 8789 Start without affecting independent 8788.
- [ ] A local standalone Node update requires reapproval but does not erase app pairing or enable other services.
- [ ] Mac app remains private when communicating configuration; no hashes or real file paths published in GitHub or transmitted to phone.
- [ ] Original iPhone Safari PiP continues while another app is foreground; return, capture-stop and pairing semantics remain correct.
- [ ] Review safe signing/provenance, dependencies, macOS TCC/XPC and file-check/start race before distributing any real user build.

## Model handoff

**Continue here** while building isolated research components. **Astra is the next recommended expert review** when we're ready to choose signed native Mac helper identity, macOS entitlement/TCC/XPC architecture or security-critical production service management. **Opus follows later** for the full iPhone Mode UX redesign. No automatic model switch is happening.
