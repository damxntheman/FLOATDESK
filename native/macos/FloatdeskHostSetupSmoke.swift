// M11 CI-only tests; runs on a GitHub macOS runner without opening GUI dialogs.
// UserDefaults store only locally chosen paths. No real Mac/iPhone acceptance.
import Foundation
import Darwin

@main
struct FloatdeskHostSetupSmoke {
    @MainActor
    static func main() {
        let args = CommandLine.arguments
        let root = ProcessInfo.processInfo.environment["FLOATDESK_REPO_ROOT"]
        let node = ProcessInfo.processInfo.environment["FLOATDESK_NODE_BIN"]
        if args.count == 3 {
            let lock = FloatdeskInstanceLock(directory:URL(fileURLWithPath:args[2],isDirectory:true))
            if args[1] == "--hold-lock" {
                do { try lock.acquire() } catch { exit(11) }
                print("M11 lock held")
                fflush(stdout)
                sleep(5)
                lock.release()
                return
            }
            if args[1] == "--expect-busy" {
                do {try lock.acquire();lock.release();exit(12)}
                catch FloatdeskInstanceLock.LockError.busy {
                    print("M11 second process lock refused")
                    return
                } catch { exit(13) }
            }
            if args[1] == "--expect-free" {
                do {try lock.acquire();lock.release()}
                catch { exit(14) }
                print("M11 lock released after owner exit")
                return
            }
        }

        guard let root, let node,
              FloatdeskLocalService.validSource(root:root,nodePath:node) else {
            fputs("Fixture source is not valid\n",stderr);exit(2)
        }
        let domain="FLOATDESK-M11-CI-" + UUID().uuidString
        guard let defaults=UserDefaults(suiteName:domain) else {exit(3)}
        defer {defaults.removePersistentDomain(forName:domain)}
        let config=FloatdeskHostSettings(defaults:defaults)
        guard !config.configured else {exit(4)}
        do {try config.save(root:root,node:node)}
        catch {exit(5)}
        guard config.configured,config.root==root,config.node==node,
              config.approvedSeal?.count==64 else {exit(6)}

        // Bad updates never replace previously stored working settings.
        do { try config.save(root:"/not/a/repository",node:node);exit(7) }
        catch {}
        guard config.root == root && config.configured else {exit(8)}
        config.clear()
        guard !config.configured,config.root==nil,config.node==nil,
              config.approvedSeal==nil else {exit(9)}

        let directory=FileManager.default.temporaryDirectory
            .appendingPathComponent("FLOATDESK-lock-" + UUID().uuidString,isDirectory:true)
        defer {try? FileManager.default.removeItem(at:directory)}
        let first=FloatdeskInstanceLock(directory:directory)
        let second=FloatdeskInstanceLock(directory:directory)
        do {try first.acquire()} catch {exit(15)}
        guard first.isHeld else {exit(16)}
        do {try second.acquire();exit(17)}
        catch FloatdeskInstanceLock.LockError.busy {}
        catch {exit(18)}
        first.release()
        do {try second.acquire()} catch {exit(19)}
        second.release()
        print("M11 settings atomicity and same-process lock test passed")
    }
}
