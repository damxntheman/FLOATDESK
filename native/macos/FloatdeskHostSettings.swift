// FLOATDESK M11 — local Mac user-selected, non-secret research settings.
// No Terminal environment variables required for configuring the local
// dashboard. Node and repository are chosen in macOS GUI; no remote client
// can set either. Never persist passwords, keys, IPs or pairing sessions.
import AppKit
import Foundation

@MainActor
final class FloatdeskHostSettings {
    private let defaults: UserDefaults
    private let prefix = "FLOATDESK.M11."

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var root: String? { defaults.string(forKey: prefix + "repository") }
    var node: String? { defaults.string(forKey: prefix + "node") }
    var approvedSeal: String? { defaults.string(forKey: prefix + "approvedSeal") }
    var configured: Bool {
        FloatdeskSourceSeal.matches(root:root,node:node,approved:approvedSeal)
    }

    func save(root: String, node: String) throws {
        guard FloatdeskLocalService.validSource(root: root, nodePath: node) else {
            throw NSError(domain:"FLOATDESK",code:11,
                          userInfo:[NSLocalizedDescriptionKey:"Choose a FLOATDESK repository and a working Node executable."])
        }
        // Snapshot reviewable local project code AND selected Node binary.
        // This is a change detector, not notarization or code signing.
        let seal = try FloatdeskSourceSeal.make(root:root,node:node)
        defaults.set(root, forKey: prefix + "repository")
        defaults.set(node, forKey: prefix + "node")
        defaults.set(seal, forKey: prefix + "approvedSeal")
    }

    func clear() {
        defaults.removeObject(forKey: prefix + "repository")
        defaults.removeObject(forKey: prefix + "node")
        defaults.removeObject(forKey: prefix + "approvedSeal")
    }

    func chooseUsingMacDialogs() throws -> Bool {
        let repo = NSOpenPanel()
        repo.title = "FLOATDESK — Select the trusted project folder"
        repo.message = "Choose the folder containing package.json and src/managed-host.js. This configures ONLY the Mac-local research dashboard."
        repo.prompt = "Use this folder"
        repo.canChooseDirectories = true
        repo.canChooseFiles = false
        repo.allowsMultipleSelection = false
        repo.canCreateDirectories = false
        guard repo.runModal() == .OK, let folder = repo.url else { return false }

        let nodePicker = NSOpenPanel()
        nodePicker.title = "FLOATDESK — Select the Node executable"
        nodePicker.message = "Select the installed Node program, not a script. FLOATDESK will never run phone-supplied commands."
        nodePicker.prompt = "Use Node"
        nodePicker.canChooseDirectories = false
        nodePicker.canChooseFiles = true
        nodePicker.allowsMultipleSelection = false
        nodePicker.canCreateDirectories = false
        // Try the common Apple Silicon Homebrew installation location, but
        // never auto-execute a discovered binary before owner selection.
        let homebrew = URL(fileURLWithPath:"/opt/homebrew/bin",isDirectory:true)
        if FileManager.default.fileExists(atPath:homebrew.path) {
            nodePicker.directoryURL = homebrew
        }
        guard nodePicker.runModal() == .OK, let executable = nodePicker.url else {
            return false // atomic: cancelling second panel keeps old settings
        }
        try save(root:folder.path, node:executable.path)
        return true
    }
}
