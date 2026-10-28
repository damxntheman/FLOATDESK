// FLOATDESK M12 — local research source integrity snapshot.
//
// Detects ACCIDENTAL modifications to the user-approved Node binary and
// FLOATDESK server files between Mac setup and Start. SHA-256 is an integrity
// comparison, NOT proof of signed/untainted executable identity. An attacker
// controlling the same Mac user or files can bypass a research-only check.
// Never print paths, file contents, hashes, user IDs or network configuration.
import CryptoKit
import Foundation
import Darwin

@MainActor
enum FloatdeskSourceSeal {
    enum SealError: Error { case invalidConfiguration, unsafeFile, tooLarge, unavailable }
    // Seal ALL source files in these two flat research directories, not
    // merely the entrypoint. Any new/removed file changes the approval.
    // Nested directories are denied until an explicit audited policy exists.
    private static let sourceDirs = ["src", "public"]
    private static let maxBytes: UInt64 = 512 * 1024 * 1024

    private static func safeHash(of url: URL, executable: Bool) throws -> Data {
        let path = url.path
        let fd = Darwin.open(path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
        if fd < 0 { throw SealError.unavailable }
        defer { Darwin.close(fd) }
        var st = stat()
        guard Darwin.fstat(fd, &st) == 0,
              (st.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG),
              st.st_size >= 0, UInt64(st.st_size) <= maxBytes,
              (st.st_mode & 0o022) == 0,
              !executable || (st.st_mode & 0o111) != 0 else {
            throw SealError.unsafeFile
        }
        var digest = SHA256()
        var bytesRead: UInt64 = 0
        var buffer = [UInt8](repeating:0,count:64 * 1024)
        while true {
            let amount = buffer.withUnsafeMutableBytes {
                Darwin.read(fd, $0.baseAddress, $0.count)
            }
            if amount < 0 {
                if errno == EINTR { continue }
                throw SealError.unavailable
            }
            if amount == 0 { break }
            bytesRead += UInt64(amount)
            if bytesRead > maxBytes { throw SealError.tooLarge }
            digest.update(data:Data(buffer.prefix(amount)))
        }
        // If source changes while hashing, a future Start check must fail
        // unless the resulting bytes still match the original snapshot.
        return Data(digest.finalize())
    }

    static func make(root: String?, node: String?) throws -> String {
        guard FloatdeskLocalService.validSource(root:root,nodePath:node),
              let root, let node else { throw SealError.invalidConfiguration }
        let rootURL = URL(fileURLWithPath:root,isDirectory:true).resolvingSymlinksInPath()
        let nodeURL = URL(fileURLWithPath:node).resolvingSymlinksInPath()
        var aggregate = SHA256()
        aggregate.update(data:Data("FLOATDESK-LOCAL-SNAPSHOT-V1".utf8))
        aggregate.update(data:Data("package.json".utf8))
        aggregate.update(data:try safeHash(of:rootURL.appendingPathComponent("package.json"),
                                           executable:false))
        for directory in sourceDirs {
            let sourceURL = rootURL.appendingPathComponent(directory,isDirectory:true)
            let names = try FileManager.default.contentsOfDirectory(atPath:sourceURL.path).sorted()
            guard !names.isEmpty, names.count <= 300 else { throw SealError.unsafeFile }
            aggregate.update(data:Data(directory.utf8))
            for name in names {
                guard !name.isEmpty, name != ".", name != "..",
                      !name.contains("/"), !name.contains("\\") else {
                    throw SealError.unsafeFile
                }
                aggregate.update(data:Data(name.utf8))
                // Symlinks, nested source dirs and special files fail closed.
                aggregate.update(data:try safeHash(of:sourceURL.appendingPathComponent(name),
                                                   executable:false))
            }
        }
        aggregate.update(data:Data("node".utf8))
        aggregate.update(data:try safeHash(of:nodeURL,executable:true))
        return Data(aggregate.finalize()).map { String(format:"%02x",$0) }.joined()
    }

    static func matches(root: String?,node: String?, approved: String?) -> Bool {
        guard let approved, approved.count == 64,
              let current = try? make(root:root,node:node) else { return false }
        return current == approved
    }
}
