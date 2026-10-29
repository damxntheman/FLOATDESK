# M13 bounded foundation implementation plan

Spec: [owner-approved handoff](M13-ASTRA-HANDOFF.md). User authorizes independent audit, safe fixes, tests and PR; physical testing is deferred.

Architecture: preserve browser/WebRTC PiP and the distinct 8788/8789 lifecycles. Repair existing fail-closed boundaries without adding native privileges, listeners or production entitlements. The production recommendation and remaining decisions live in [M13 review](M13-ASTRA-REVIEW.md).

## Work and verification

1. Pin current main and compare M12; inspect source, security documentation and actual Actions job logs. Independently review session and native boundaries; verify Apple claims against official documentation.
2. `src/registry.js`, `src/server.js`, registry/signaling regressions: reproduce prune bypassing teardown; add one synchronous removal path for expiry and stop, and revoke grants on every successful resume regardless of displaced socket state. Test all opportunistic prune entrypoints, one-time notification and authorization invalidation.
3. `FloatdeskNativeFilesBroker.swift`, `src/native-files-broker.js`, adapter tests and macOS CI fixture: reproduce split UTF-8 corruption; preserve byte framing with fatal decoding and bounded frames. Give repeated enumeration independent directory offsets and close descriptors on failure. Verify repeated root/nested listings and traversal/symlink denial on macOS CI.
4. `scripts/verify-mac-release.sh`, new negative tests: reproduce path text satisfying the runtime check and prefix team matching. Match signature fields/flags precisely; retain ad-hoc rejection and manual release gate. Stub CLI tests are parser checks, never signing evidence.
5. Run full Node tests and syntax checks; obtain independent diff review; create feature PR from pinned upstream main. Inspect actual PR CI jobs/logs including native compilation, lifecycle and integrity tests. Record exact commits and results in M13 review and PR.

## Review focus / constraints

- Expiry during lookup must close capabilities even before periodic housekeeping.
- A closing displaced socket must not transfer grants; stale socket callbacks must not revoke a replacement grant.
- Unicode across arbitrary byte boundaries must preserve names; invalid/partial output must fail closed.
- Repeated root enumeration must not share the held root's directory offset.
- Runtime/path text and team prefixes must not satisfy a production release check.
- No UI redesign, native capture, full Terminal, writes/transfers, auto-start, secrets, new exposure or merging of 8788 and 8789.
- Local and CI automation do not establish MacBook M1/iPhone 16 acceptance; final hardware/signing/architecture gates remain explicit.
