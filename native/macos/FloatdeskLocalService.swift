// FLOATDESK M10 — explicitly operator-owned loopback dashboard child.
//
// This is NOT a signed service supervisor. A Mac user click starts a Node
// child bound to 127.0.0.1:8789. A retained stdin pipe is the ownership
// heartbeat: on owner process death/pipe EOF the child exits. The existing
// independent HTTPS LAN port 8788 and iPhone PiP are NOT managed here.
import Foundation

@MainActor
final class FloatdeskLocalService {
    enum StartError: Error {
        case alreadyRunning, notConfigured, unsafeSource, unavailableNode
    }

    static let port = "8789"
    private var child: Process?
    private var ownerPipe: Pipe?
    private let instanceLock: FloatdeskInstanceLock
    private(set) var isStopping = false

    init(instanceLock: FloatdeskInstanceLock? = nil) {
        self.instanceLock = instanceLock ?? FloatdeskInstanceLock()
    }

    var isRunning: Bool { child?.isRunning ?? false }

    // Avoid unlocking before the child really exits. A second Mac Host may
    // not bind the same loopback port while our old child shuts down.
    func reapExited() {
        guard let process = child, !process.isRunning else { return }
        child = nil
        ownerPipe = nil
        isStopping = false
        instanceLock.release()
    }

    static func validSource(root: String?, nodePath: String?) -> Bool {
        guard let root, let nodePath,
              root.hasPrefix("/"), nodePath.hasPrefix("/"),
              !root.contains("\0"), !nodePath.contains("\0"),
              !root.contains("\n"), !nodePath.contains("\n") else { return false }
        let rootURL = URL(fileURLWithPath: root, isDirectory: true).resolvingSymlinksInPath()
        let nodeURL = URL(fileURLWithPath: nodePath).resolvingSymlinksInPath()
        let script = rootURL.appendingPathComponent("src/managed-host.js")
        let package = rootURL.appendingPathComponent("package.json")
        return FileManager.default.fileExists(atPath: script.path) &&
            FileManager.default.isReadableFile(atPath: script.path) &&
            FileManager.default.fileExists(atPath: package.path) &&
            FileManager.default.isExecutableFile(atPath: nodeURL.path)
    }

    func start(root: String?, nodePath: String?) throws {
        reapExited()
        guard child == nil && !isStopping else { throw StartError.alreadyRunning }
        guard root != nil && nodePath != nil else { throw StartError.notConfigured }
        guard Self.validSource(root: root, nodePath: nodePath) else {
            throw StartError.unsafeSource
        }
        guard let root, let nodePath else { throw StartError.notConfigured }
        try instanceLock.acquire()
        var started = false
        defer { if !started { instanceLock.release() } }
        let folder = URL(fileURLWithPath: root, isDirectory: true).resolvingSymlinksInPath()
        let node = URL(fileURLWithPath: nodePath).resolvingSymlinksInPath()
        let script = folder.appendingPathComponent("src/managed-host.js")

        let process = Process()
        process.executableURL = node
        process.arguments = [script.path] // reviewed fixed source, not remote args
        process.currentDirectoryURL = folder
        process.environment = [
            "HOME": NSHomeDirectory(),
            "PATH": "/usr/bin:/bin",
            "HOST": "127.0.0.1",
            "PORT": Self.port,
            "NODE_ENV": "development"
        ]
        let pipe = Pipe()
        process.standardInput = pipe
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        // The write end is kept ONLY by the current menu app instance.
        // No child inherits a copy of the write FD; when the menu process
        // dies, EOF propagates to the Node child.
        ownerPipe = pipe
        child = process
        started = true
    }

    func stop() {
        reapExited()
        guard let process = child else { return }
        if isStopping { return }
        isStopping = true
        // Retain lock until the process ACTUALLY exits; the next menu
        // refresh/start reaps it. No busy-wait on the AppKit UI thread.
        ownerPipe?.fileHandleForWriting.closeFile()
        ownerPipe = nil
        if process.isRunning { process.terminate() }
        reapExited()
    }
}
