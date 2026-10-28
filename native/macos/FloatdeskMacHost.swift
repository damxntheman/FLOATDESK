// FLOATDESK M8 — deliberately minimal native macOS menu bar shell.
//
// Does NOT launch a daemon, bind a port, control the screen, inspect files,
// grant system permission, or replace PiP. It only opens the LOCAL dashboard.
import AppKit

@MainActor
final class FloatdeskMenuDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private let localService = FloatdeskLocalService()
    private var localStart: NSMenuItem?
    private var localStop: NSMenuItem?
    private var localOpen: NSMenuItem?
    private var localStatus: NSMenuItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "FLOATDESK"

        let menu = NSMenu(title: "FLOATDESK")
        let info = NSMenuItem(title: "Research host · server managed separately",
                              action: nil, keyEquivalent: "")
        info.isEnabled = false
        menu.addItem(info)
        menu.addItem(NSMenuItem.separator())

        let open = NSMenuItem(title: "Open Mac control dashboard",
                              action: #selector(openDashboard), keyEquivalent: "")
        open.target = self
        menu.addItem(open)
        menu.addItem(NSMenuItem.separator())

        let serviceLabel = NSMenuItem(title: "Local research service · off",
                                     action: nil, keyEquivalent: "")
        serviceLabel.isEnabled = false
        localStatus = serviceLabel
        menu.addItem(serviceLabel)

        let start = NSMenuItem(title: "Start local dashboard (loopback only)",
                               action: #selector(startLocalService), keyEquivalent: "")
        start.target = self
        localStart = start
        menu.addItem(start)

        let stop = NSMenuItem(title: "Stop managed local dashboard",
                              action: #selector(stopLocalService), keyEquivalent: "")
        stop.target = self
        localStop = stop
        menu.addItem(stop)

        let openLocal = NSMenuItem(title: "Open managed local dashboard",
                                   action: #selector(openLocalDashboard), keyEquivalent: "")
        openLocal.target = self
        localOpen = openLocal
        menu.addItem(openLocal)
        menu.delegate = self
        menu.addItem(NSMenuItem.separator())

        let privacy = NSMenuItem(title: "PiP & iPhone Mode remain in the browser",
                                 action: nil, keyEquivalent: "")
        privacy.isEnabled = false
        menu.addItem(privacy)

        let quit = NSMenuItem(title: "Quit menu bar shell",
                              action: #selector(quitShell), keyEquivalent: "")
        quit.target = self
        menu.addItem(quit)
        item.menu = menu
        statusItem = item
    }

    @objc private func openDashboard() {
        // Fixed loopback URL. No remote IP, custom scheme or credentials.
        guard let url = URL(string: "https://localhost:8788") else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func startLocalService() {
        // Explicit Mac user interaction only; no login item, auto-start,
        // phone command, remote socket or automatic privileged permission.
        let env = ProcessInfo.processInfo.environment
        do {
            try localService.start(root: env["FLOATDESK_REPO_ROOT"],
                                   nodePath: env["FLOATDESK_NODE_BIN"])
        } catch {
            let alert = NSAlert()
            alert.messageText = "Local research service was not started"
            alert.informativeText = "Configure a trusted checkout and Node executable locally, or stop any existing service on port 8789. The existing LAN/PiP server is unaffected."
            alert.alertStyle = .warning
            alert.runModal()
        }
    }

    @objc private func stopLocalService() {
        localService.stop()
    }

    @objc private func openLocalDashboard() {
        guard localService.isRunning,
              let url = URL(string: "http://127.0.0.1:8789") else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func quitShell() {
        // Stop only the directly owned local service. Any separately started
        // trusted-LAN HTTPS/PiP server remains entirely independent.
        localService.stop()
        NSApp.terminate(nil)
    }
}

extension FloatdeskMenuDelegate: NSMenuDelegate {
    func menuWillOpen(_ menu: NSMenu) {
        let running = localService.isRunning
        let env = ProcessInfo.processInfo.environment
        let configured = FloatdeskLocalService.validSource(
            root: env["FLOATDESK_REPO_ROOT"], nodePath: env["FLOATDESK_NODE_BIN"])
        localStatus?.title = running ? "Local research service · running on 127.0.0.1:8789"
            : "Local research service · stopped"
        localStart?.isEnabled = !running && configured
        localStop?.isEnabled = running
        localOpen?.isEnabled = running
    }
}

@main
struct FloatdeskMacHost {
    static func main() {
        let app = NSApplication.shared
        let delegate = FloatdeskMenuDelegate()
        app.delegate = delegate
        app.run()
    }
}
