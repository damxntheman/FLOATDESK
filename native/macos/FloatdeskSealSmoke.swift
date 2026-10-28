// M12 CI-only integrity snapshot regression (NO real device or GUI).
// A copied checkout is modified to demonstrate that a changed module
// requires renewed explicit Mac operator approval before local launch.
import Foundation

@main
struct FloatdeskSealSmoke {
    @MainActor
    static func main() {
        let env = ProcessInfo.processInfo.environment
        guard let checkout = env["FLOATDESK_REPO_ROOT"], let node = env["FLOATDESK_NODE_BIN"],
              FloatdeskLocalService.validSource(root:checkout,nodePath:node) else {
            fputs("M12 CI source unavailable\n",stderr);exit(2)
        }
        let fm=FileManager.default
        let root=fm.temporaryDirectory
            .appendingPathComponent("floatdesk-m12-" + UUID().uuidString,isDirectory:true)
        defer {try? fm.removeItem(at:root)}
        do {
            try fm.createDirectory(at:root,withIntermediateDirectories:true)
            for folder in ["src","public"] {
                try fm.copyItem(at:URL(fileURLWithPath:checkout).appendingPathComponent(folder),
                                to:root.appendingPathComponent(folder))
            }
            try fm.copyItem(at:URL(fileURLWithPath:checkout).appendingPathComponent("package.json"),
                            to:root.appendingPathComponent("package.json"))
            let path=root.path
            let seal=try FloatdeskSourceSeal.make(root:path,node:node)
            guard FloatdeskSourceSeal.matches(root:path,node:node,approved:seal) else {exit(3)}
            let domain="FLOATDESK-M12-CI-" + UUID().uuidString
            guard let defaults=UserDefaults(suiteName:domain) else {exit(4)}
            defer {defaults.removePersistentDomain(forName:domain)}
            let config=FloatdeskHostSettings(defaults:defaults)
            try config.save(root:path,node:node)
            guard config.configured,config.approvedSeal==seal else {exit(5)}
            let changed=root.appendingPathComponent("src").appendingPathComponent("app-access.js")
            try (try String(contentsOf:changed,encoding:.utf8) + "\n// M12 changed source\n")
                .write(to:changed,atomically:true,encoding:.utf8)
            guard !FloatdeskSourceSeal.matches(root:path,node:node,approved:seal),
                  !config.configured else {exit(6)}
            // A failed check cannot start a local server or grab ownership.
            let service=FloatdeskLocalService()
            do {
                try service.start(root:path,nodePath:node,approvedSeal:seal)
                service.stop();exit(7)
            } catch FloatdeskLocalService.StartError.unsafeSource {
                // Expected: changed approved contents are refused.
            } catch {exit(8)}
            try config.save(root:path,node:node)
            guard config.configured,config.approvedSeal != seal else {exit(9)}
            // Updating a browser asset must invalidate the approval too.
            let page=root.appendingPathComponent("public").appendingPathComponent("index.html")
            try (try String(contentsOf:page,encoding:.utf8) + "\n<!--changed-->\n")
                .write(to:page,atomically:true,encoding:.utf8)
            guard !config.configured else {exit(10)}
            // A new file under the source tree changes the approved manifest.
            try config.save(root:path,node:node)
            let newcomer=root.appendingPathComponent("src").appendingPathComponent("new-module.js")
            try "// new file\n".write(to:newcomer,atomically:true,encoding:.utf8)
            guard !config.configured else {exit(11)}
            print("M12 source-change, browser-change and new-module denial passed")
        } catch {
            fputs("M12 source sealing fixture failed\n",stderr)
            exit(12)
        }
    }
}
