// FLOATDESK M8 — deliberately minimal native macOS menu bar shell.
//
// Does NOT launch a daemon, bind a port, control the screen, inspect files,
// grant system permission, or replace PiP. It only opens the LOCAL dashboard.
import AppKit

@MainActor
final class FloatdeskMenuDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?

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

    @objc private func quitShell() {
        NSApp.terminate(nil)
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
