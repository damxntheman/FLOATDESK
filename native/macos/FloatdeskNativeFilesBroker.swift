// FLOATDESK M7 — Native, read-only Files broker.
// The Mac owner chooses a folder in THIS process. All directory I/O stays
// in the same process. No path, token, home directory or file body is emitted.
// Phone names are relative only. Traversal uses openat(O_NOFOLLOW|O_DIRECTORY)
// from the selected directory FD, to avoid a pathname-check / symlink race.
//
// Production binary does NOT accept a root path argument or headless grant.
// Test-only fixture entrypoint exists exclusively under -D FLOATDESK_TESTING.
import AppKit
import Foundation
import Darwin

private let maxItems = 100

private func validComponent(_ name: String) -> Bool {
    if name.isEmpty || name.hasPrefix(".") || name.utf8.count > 160 { return false }
    if name == ".." || name.contains("/") || name.contains("\\") { return false }
    return !name.unicodeScalars.contains { $0.value < 32 || $0.value == 127 }
}

private func safeComponents(_ relative: String) -> [String]? {
    if relative == "." || relative == "" { return [] }
    if relative.utf8.count > 1000 || relative.hasPrefix("/") { return nil }
    let parts = relative.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
    if parts.count > 12 || parts.contains(where: { !validComponent($0) }) { return nil }
    return parts
}

private func entryName(_ entry: UnsafeMutablePointer<dirent>) -> String {
    return withUnsafePointer(to: entry.pointee.d_name) { pointer in
        pointer.withMemoryRebound(to: CChar.self,
                                  capacity: MemoryLayout.size(ofValue: entry.pointee.d_name)) {
            String(cString: $0)
        }
    }
}

// Only a directory FD returned by NSOpenPanel is used as the start point.
// Each nested component is opened AT the prior FD with no symlink following.
private func directoryFD(root: Int32, relative: String) -> Int32? {
    guard let parts = safeComponents(relative), root >= 0 else { return nil }
    // dup(root) shares its directory offset. Opening "." at the approved FD
    // gives each listing its own open file description, including root lists.
    var fd = Darwin.openat(root, ".", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
    if fd < 0 { return nil }
    for component in parts {
        let next = Darwin.openat(fd, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        Darwin.close(fd)
        if next < 0 { return nil }
        fd = next
    }
    return fd
}

private func enumerate(root: Int32, relative: String) -> [String: Any]? {
    guard let fd = directoryFD(root: root, relative: relative) else { return nil }
    defer { Darwin.close(fd) }
    // fdopendir takes ownership of a DUPLICATE. Keep fd usable until defer.
    let scanFD = Darwin.dup(fd)
    guard scanFD >= 0 else { return nil }
    guard let dir = Darwin.fdopendir(scanFD) else {
        Darwin.close(scanFD) // fdopendir owns the descriptor only on success.
        return nil
    }
    defer { Darwin.closedir(dir) }

    var entries: [[String: String]] = []
    var truncated = false
    while let ptr = Darwin.readdir(dir) {
        let name = entryName(ptr)
        if !validComponent(name) { continue }
        var metadata = stat()
        if Darwin.fstatat(fd, name, &metadata, AT_SYMLINK_NOFOLLOW) != 0 { continue }
        let fileType = metadata.st_mode & mode_t(S_IFMT)
        let kind: String
        if fileType == mode_t(S_IFDIR) { kind = "folder" }
        else if fileType == mode_t(S_IFREG) { kind = "file" }
        else { continue } // symlink, device, socket and FIFO excluded
        if entries.count == maxItems { truncated = true; break }
        entries.append(["name": name, "kind": kind])
    }
    entries.sort {
        if $0["kind"] != $1["kind"] { return $0["kind"] == "folder" }
        return ($0["name"] ?? "").localizedStandardCompare($1["name"] ?? "") == .orderedAscending
    }
    return ["folder": relative == "." ? "" : relative,
            "entries": entries, "truncated": truncated]
}

private func emit(_ response: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(response),
          let bytes = try? JSONSerialization.data(withJSONObject: response, options: [.sortedKeys]),
          let text = String(data: bytes, encoding: .utf8) else { return }
    print(text)
    fflush(stdout)
}
private func requestIdValid(_ id: String) -> Bool {
    return id.range(of: "^[0-9a-f]{16}$", options: .regularExpression) != nil
}

#if FLOATDESK_TESTING
// CI can test the FD scanner on an isolated temporary directory. This
// entrypoint is NOT compiled into the production binary.
if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--self-test" {
    let root = Darwin.open(CommandLine.arguments[2], O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
    if root < 0 { exit(2) }
    defer { Darwin.close(root) }
    let valid = enumerate(root: root, relative: ".")
    let safe = enumerate(root: root, relative: "Folder")
    let repeatedRoot = enumerate(root: root, relative: ".")
    let repeatedNested = enumerate(root: root, relative: "Folder")
    let rejected = enumerate(root: root, relative: "../etc")
    let rejectedSymlink = enumerate(root: root, relative: "Escape")
    let repeatStable = valid != nil && safe != nil &&
        (valid?["entries"] as? [[String:String]]) == (repeatedRoot?["entries"] as? [[String:String]]) &&
        (safe?["entries"] as? [[String:String]]) == (repeatedNested?["entries"] as? [[String:String]])
    emit(["type":"native-files-self-test","root":valid ?? [:],"nested":safe ?? [:],
          "repeatedRoot":repeatedRoot ?? [:],"repeatedNested":repeatedNested ?? [:],
          "repeatStable":repeatStable,
          "traversalDenied":rejected == nil,"symlinkDenied":rejectedSymlink == nil])
    exit(!repeatStable || rejected != nil || rejectedSymlink != nil ? 2 : 0)
}
#endif

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let panel = NSOpenPanel()
panel.title = "FLOATDESK — Choose a read-only Files folder"
panel.message = "Only file and folder names will be shared with your paired iPhone for up to five minutes. No file contents or edits."
panel.prompt = "Allow read-only names"
panel.canChooseDirectories = true
panel.canChooseFiles = false
panel.allowsMultipleSelection = false
panel.canCreateDirectories = false
panel.resolvesAliases = false
app.activate(ignoringOtherApps: true)

guard panel.runModal() == .OK, let selected = panel.url, selected.isFileURL else {
    emit(["version":1, "type":"cancelled"])
    exit(0)
}
let scoped = selected.startAccessingSecurityScopedResource()
defer { if scoped { selected.stopAccessingSecurityScopedResource() } }
let root = Darwin.open(selected.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
guard root >= 0 else {
    emit(["version":1, "type":"denied"])
    exit(2)
}
defer { Darwin.close(root) }

// Never print absolute paths; label only, not file contents.
let label = String(selected.lastPathComponent.prefix(80))
emit(["version":1, "type":"selected", "label":label.isEmpty ? "Selected folder" : label])

while let line = readLine(strippingNewline: true) {
    if line.utf8.count > 2048 { break }
    guard let bytes = line.data(using: .utf8),
          let input = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
          input["version"] as? Int == 1 else { break }
    let type = input["type"] as? String ?? ""
    if type == "stop" { break }
    guard type == "list", let requestId = input["requestId"] as? String,
          requestIdValid(requestId), let folder = input["folder"] as? String else { break }
    if let result = enumerate(root: root, relative: folder) {
        var answer: [String: Any] = ["version":1, "type":"listing", "requestId":requestId]
        for (key, value) in result { answer[key] = value }
        emit(answer)
    } else {
        emit(["version":1, "type":"error", "requestId":requestId,
              "message":"Folder unavailable or not permitted."])
    }
}
