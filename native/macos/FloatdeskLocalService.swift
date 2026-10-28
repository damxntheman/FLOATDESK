// FLOATDESK M9 — explicitly operator-controlled LOOPBACK-ONLY research server.
//
// This is NOT a launch agent, daemon, installer, signed security boundary,
// phone-facing production service or an automatic startup mechanism.
// It only owns the direct child Process it creates on a Mac-local user click.
// Existing Safari PiP / trusted-LAN HTTPS server remain completely separate.
import Foundation

@MainActor
final class FloatdeskLocalService {
    enum StartError: Error {
        case alreadyRunning, notConfigured, unsafeSource, unavailableNode
    }

    static let port = "8789"
    private var child: Process?

    var isRunning: Bool { child?.isRunning ?? false }

    static func validSource(root: String?, nodePath: String?) -> Bool {
        guard let root, let nodePath,
              root.hasPrefix("/"), nodePath.hasPrefix("/"),
              !root.contains("\0"), !nodePath.contains("\0"),
              !root.contains("\n"), !nodePath.contains("\n") else { return false }
        let rootURL = URL(fileURLWithPath: root, isDirectory: true).resolvingSymlinksInPath()
        let nodeURL = URL(fileURLWithPath: nodePath).resolvingSymlinksInPath()
        let script = rootURL.appendingPathComponent("src/server.js")
        let package = rootURL.appendingPathComponent("package.json")
        return FileManager.default.fileExists(atPath: script.path) &&
            FileManager.default.isReadableFile(atPath: script.path) &&
            FileManager.default.fileExists(atPath: package.path) &&
            FileManager.default.isExecutableFile(atPath: nodeURL.path)
    }

    func start(root: String?, nodePath: String?) throws {
        guard !isRunning else { throw StartError.alreadyRunning }
        guard root != nil && nodePath != nil else { throw StartError.notConfigured }
        guard Self.validSource(root: root, nodePath: nodePath) else {
            throw StartError.unsafeSource
        }
        guard let root, let nodePath else { throw StartError.notConfigured }
        let folder = URL(fileURLWithPath: root, isDirectory: true).resolvingSymlinksInPath()
        let node = URL(fileURLWithPath: nodePath).resolvingSymlinksInPath()
        let script = folder.appendingPathComponent("src/server.js")

        let process = Process()
        process.executableURL = node
        process.arguments = [script.path] // fixed source file; never a remote command
        process.currentDirectoryURL = folder
        // Intentionally scrub inherited secrets and all LAN/TLS/native-helper
        // variables. This source-only research service stays local to the Mac.
        process.environment = [
            "HOME": NSHomeDirectory(),
            "PATH": "/usr/bin:/bin",
            "HOST": "127.0.0.1",
            "PORT": Self.port,
            "NODE_ENV": "development"
        ]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        child = process
    }

    func stop() {
        guard let process = child else { return }
        child = nil
        // Never signal a PID supplied by anyone else. Only terminate the
        // precise Process object started through this menu bar instance.
        if process.isRunning { process.terminate() }
    }
}
