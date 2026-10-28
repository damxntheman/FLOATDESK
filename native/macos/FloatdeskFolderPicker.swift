// FLOATDESK M5: explicit Mac owner folder chooser, no network listener.
// Build locally with: xcrun swiftc native/macos/FloatdeskFolderPicker.swift -o build/floatdesk-folder-picker
// This GUI helper runs only after the paired Mac owner clicks Choose folder.
// Swift source is reviewable; there is no shell or arbitrary file operation.
import AppKit
import Foundation

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let panel = NSOpenPanel()
panel.title = "FLOATDESK — Choose a folder"
panel.message = "Only names of files and subfolders will be shared with your paired phone. No file contents or changes. Permission expires in five minutes."
panel.prompt = "Share folder names"
panel.canChooseDirectories = true
panel.canChooseFiles = false
panel.allowsMultipleSelection = false
panel.canCreateDirectories = false
panel.resolvesAliases = false
app.activate(ignoringOtherApps: true)
let result = panel.runModal()
let outcome: [String: String]
if result == .OK, let selected = panel.url, selected.isFileURL {
    outcome = ["type": "chosen", "path": selected.path]
} else {
    outcome = ["type": "cancelled"]
}
if let data = try? JSONSerialization.data(withJSONObject: outcome),
   let line = String(data: data, encoding: .utf8) {
    print(line)
    fflush(stdout)
}
