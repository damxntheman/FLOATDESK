# M6 — Native Mac Companion Architecture: secure first handshake

**Source milestone, not hardware acceptance.** The owner requested deferring physical MacBook/iPhone testing. No screen capture, input, Terminal, folder permissions, or PiP pipeline have migrated to native code.

## Why this milestone

FLOATDESK is building three complementary interfaces:
1. **PiP (view only):** a small floating live video of the Mac while other phone apps are used. Must remain a permanent product feature, never replaced by an iPhone app launcher. Do not promise control inside iOS floating PiP.
2. **Desktop Mode:** live full desktop with manually approved remote input when needed.
3. **iPhone Mode:** phone-native-feeling mobile experiences such as Files, Terminal and launchers that use deliberately bounded Mac operations.

The previous Node+Chrome/Safari research prototype is retained; browser PiP has been user-reported to work on iPhone 16. Native iOS PiP is NOT established. A future native iOS integration could evaluate Apple's supported PiP media surfaces and AVKit APIs with real iPhone tests, without assuming any arbitrary WebRTC video source can be used in background PiP.

## M6 implementation

Files:
- \`native/macos/FloatdeskCompanionProbe.swift\`: tiny Swift command-line program, no macOS Accessibility, capture, file, shell or GUI permissions. Accepts a single fixed JSON \`hello\` and responds with \`hello-ack\` with all capabilities false. Exits.
- \`src/native-companion.js\`: local process launcher + strict version/nonce/capability validation. 2 KiB output bound, 5-second default timeout, process teardown, no arbitrary commands or remote paths. Rejects missing binary and non-macOS by default.
- \`src/server.js\`: only the authenticated Mac host connecting from loopback can issue \`companion-probe\`. It runs only an owner-selected executable from \`FLOATDESK_COMPANION_BIN\`. Paired phone requests are denied.
- \`public/index.html\` / \`public/client.js\`: Mac-only **Check companion readiness** button. A successful result means ONLY that the optional protocol handshake responded. It does not grant an OS permission or indicate native video/input is ready.
- Automated tests cover clean/invalid messages, version skew, privilege escalation claims, crash/timeout, browser compatibility and server role separation.

### Request / response

\`\`\`json
{"version":1,"type":"hello","requestId":"0123456789abcdef0123456789abcdef"}
\`\`\`

\`\`\`json
{
  "version":1,
  "type":"hello-ack",
  "requestId":"0123456789abcdef0123456789abcdef",
  "platform":"macos",
  "capabilities":{"capture":false,"input":false,"files":false,"terminal":false}
}
\`\`\`

The actual request ID is randomly generated for each local handshake. No credentials, system version, user home directory, application paths or local IP addresses are included. Unknown capabilities or any \`true\` capability are rejected pending separate review.

## Owner-only Mac build when physical tests resume (do not ask now)

\`\`\`sh
cd ~/FLOATDESK
git pull --ff-only
npm test
mkdir -p build
xcrun swiftc native/macos/FloatdeskCompanionProbe.swift \
  -o build/floatdesk-companion-probe
\`\`\`

Start the existing trusted LAN setup on **port 8788**, adding the optional \`FLOATDESK_COMPANION_BIN="$PWD/build/floatdesk-companion-probe"\` to your existing environment variables. **Do not publish local IPs or signing secrets.** Open the host panel at \`https://localhost:8788\`, create/resume your session, and click **Check companion readiness**.

Without the new variable configured, host reports **not configured**; this is expected and safe. Desktop Mode/PiP remain usable. Do not expose the Node research server via port forwarding or public networking.

## Architecture direction (Astra)

Next native Mac companion should separate privilege domains:
- **Capture service** (future): explicit macOS Screen Recording permission, deliberate display/window selection; avoid infinite mirror and maintain tested media stop.
- **Read-only Files service** (future): native GUI folder picker and scoped file enumeration **in the same native privilege/process domain**; replace M5's split Swift-picker/Node-reader design before access to sensitive folders.
- **Input service** (future): Accessibility approval and very short Mac-owner-approved grants. No implicit mouse permission from PiP, app launch or Files.
- **Terminal service** (future): opt-in interactive PTY under a separate high-risk capability; process-tree cancellation, output limits, no silent persistence.
- **iPhone viewer** (future): separately render mobile UI and a native video/PiP surface, respecting capture consent and iOS background limitations.

**None of these future capabilities is implemented by the M6 probe.** Native process signing, TCC permission transfer, PiP background behavior, native render latency, host sleep/wake, disconnect and app termination all require independent device testing. Start with a local Mac companion process; evaluate XPC when a properly signed/bundled macOS application and its actual entitlement model exist.

## Required physical gate (deferred)

- [ ] Compile Swift helper on actual Mac; approve any required Apple developer prompts safely.
- [ ] Verify Mac-local ready state and missing-helper failure with no phone commands.
- [ ] Confirm paired iPhone cannot trigger helper.
- [ ] Confirm no screen/input/files/terminal permissions are enabled by handshake.
- [ ] Verify old browser PiP still works during WhatsApp foreground and returns safely.
- [ ] Check Stop sharing, Desktop Mode, iPhone Mode, touch Exit & revoke, Files and Terminal Preview independently.
- [ ] If native functions are later introduced, evaluate signed app/TCC/XPC controls on device before enabling any privileged capability.

**Opus** owns the later visual/interaction revamp. **Astra** owns native macOS architecture, communication, performance and security.
