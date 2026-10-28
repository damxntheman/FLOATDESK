# M7 — Native owner-scoped read-only Files broker

**Status:** Code built and checked in GitHub Actions macOS runner; owner has deferred physical MacBook/iPhone tests.

## Purpose

Finder should open a comfortable mobile-style Files view, while the actual Mac directory is chosen by the Mac owner and never sent as an absolute path to Node or the phone. Floating Picture-in-Picture, Desktop Mode and the app launcher continue unchanged.

## Implementation

Native macOS program: native/macos/FloatdeskNativeFilesBroker.swift. It opens an NSOpenPanel only after Mac host approval, holds the chosen directory as a file descriptor, and lists names from that descriptor. Entering nested directories uses openat with O_DIRECTORY and O_NOFOLLOW. Metadata is read using fstatat with AT_SYMLINK_NOFOLLOW. Hidden names, parent traversal, symbolic links, devices and file writes are excluded. Listings have at most 100 items and no file content.

Node driver: src/native-files-broker.js. It runs only the explicit Mac owner-configured binary (FLOATDESK_NATIVE_FILES_BIN), passes zero directory paths or shell arguments, and receives a folder label followed by strictly validated relative listings. It rejects missing/extra fields, mismatched request IDs, unexpected paths, oversized replies, crashes, cancellation and timeouts. When the Mac or phone revokes Files permission, its subprocess and selected directory descriptor are closed.

The new native service is opted into separately. The previous M5 folder-picker/Node reader remains available when the M7 binary variable is absent; this older research implementation is less robust against filesystem pathname races. M7 is recommended for future technical work.

## macOS CI evidence

GitHub Actions now compiles the production Swift helper on macos-latest and a separate, fixture-test-only variant. That test variant can point at a harmless runner fixture folder (this capability is NOT compiled into the production binary). It proves listing regular files and folders, nested directory access, and rejection of parent traversal and symlink escape. Node automated tests also verify IPC schemas, request/response matching, process failure, timeout and revocation.

The macOS CI build is NOT proof that interactive NSOpenPanel or privacy-protected folders work on the owner's MacBook. App signing, sandbox entitlements, security-scoped URLs, TCC, long-lived processes and native iOS PiP still require real-device work and security review.

## Opt-in on physical Mac when owner requests testing later

Build with Mac Xcode command-line tools:

    cd ~/FLOATDESK
    git pull --ff-only
    npm test
    mkdir -p build
    xcrun swiftc native/macos/FloatdeskNativeFilesBroker.swift -o build/floatdesk-native-files

When launching the existing trusted-LAN HTTPS app on port 8788, add the environment variable FLOATDESK_NATIVE_FILES_BIN pointing to the absolute path under build. Continue to use Mac Chrome at localhost for the explicit Files approval. On the iPhone, Finder opens the mobile Files view. For initial testing, select a harmless, temporary folder of invented names, not personal Documents or important projects. Do NOT enable public port forwarding or publish real network addresses or credentials.

## Outstanding mandatory physical checks (deferred)

- [ ] Native owner picker opens/cancels correctly and no Mac root paths are sent to Node or iPhone.
- [ ] Browsing nested folders, symlink refusal, 100-entry truncation and empty folders behaves correctly on MacBook M1.
- [ ] Mac owner revoke, phone revoke, five-minute expiry, disconnect and broker exit immediately stop access and clear phone data.
- [ ] Native macOS TCC/sandbox and security-scoped selection behavior understood.
- [ ] M2 touch control, M3 app launcher, M4 Terminal Preview, Desktop Mode and **floating PiP with another phone app foreground** have no regressions.
- [ ] No file content/transfers/writes and no full shell granted by Files Mode.

**Next model:** Astra for Mac native architecture and security; Opus for the major iPhone UI redesign after functional proof. Do not request hardware tests until owner is ready.
