// M9 CI-only smoke test. This does not exercise the real Mac menu bar UI,
// iPhone, screen permissions or LAN/PiP. It verifies an explicitly started
// loopback Node child, duplicate refusal, HTTP service, and direct stop.
import Foundation

@main
struct FloatdeskLocalServiceSmoke {
    @MainActor
    static func main() {
        let env = ProcessInfo.processInfo.environment
        let root = env["FLOATDESK_REPO_ROOT"]
        let node = env["FLOATDESK_NODE_BIN"]
        let service = FloatdeskLocalService()

        guard FloatdeskLocalService.validSource(root: root, nodePath: node) else {
            fputs("CI service fixture not configured\n", stderr)
            exit(2)
        }
        guard !FloatdeskLocalService.validSource(root: "/not-a-repo", nodePath: node),
              !FloatdeskLocalService.validSource(root: root, nodePath: "/not-node") else {
            fputs("Unsafe configured paths accepted\n", stderr)
            exit(3)
        }
        do { try service.start(root: root, nodePath: node) }
        catch {
            fputs("Managed service failed to start\n", stderr)
            exit(4)
        }
        guard service.isRunning else {
            fputs("Managed service exited early\n", stderr)
            exit(5)
        }
        do {
            try service.start(root: root, nodePath: node)
            fputs("Duplicate child process was allowed\n", stderr)
            service.stop()
            exit(6)
        } catch FloatdeskLocalService.StartError.alreadyRunning {
            // expected: a second copy cannot start under same app instance
        } catch {
            fputs("Unexpected duplicate start error\n", stderr)
            service.stop()
            exit(7)
        }

        let target = URL(string: "http://127.0.0.1:8789/")!
        var reached = false
        for _ in 0..<35 {
            if let text = try? String(contentsOf: target, encoding: .utf8),
               text.contains("FLOATDESK") { reached = true; break }
            Thread.sleep(forTimeInterval: 0.1)
        }
        if CommandLine.arguments.contains("--simulate-owner-death") {
            guard reached else {
                fputs("Failed to establish owner-launched loopback service\n", stderr)
                service.stop()
                exit(10)
            }
            // _exit bypasses normal Swift cleanup/stop(); the OS alone
            // closes the owner's pipe FD. The Node wrapper must detect EOF.
            fflush(stdout)
            _exit(0)
        }
        service.stop()
        if !reached {
            fputs("Loopback-only dashboard did not respond\n", stderr)
            exit(8)
        }
        // Stop is deliberately nonblocking for AppKit; wait in THIS CI
        // harness for the child to exit, then release the owner lock.
        for _ in 0..<60 {
            if !service.isRunning { break }
            Thread.sleep(forTimeInterval: 0.05)
        }
        service.reapExited()
        // The service is not auto-restarted after Stop.
        guard !service.isRunning else {
            fputs("Managed service remained attached after stop\n", stderr)
            exit(9)
        }
        print("M9 explicit local service lifecycle smoke test passed")
    }
}
