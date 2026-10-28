// FLOATDESK M11 — advisory file lock for duplicate LOCAL menu hosts.
// Lifetime is exactly the owner process/explicit Stop. No PID files,
// killing outside processes, global launch agent or cloud lock.
import Foundation
import Darwin

// macOS Swift imports the C `flock` structure under the same name as the
// flock(2) function. Bind explicitly to the libc symbol to avoid ambiguity.
@_silgen_name("flock")
private func floatdeskFlock(_ descriptor: Int32, _ operation: Int32) -> Int32

@MainActor
final class FloatdeskInstanceLock {
    enum LockError: Error { case unavailable, busy, unsafeFile }
    private var descriptor: Int32 = -1
    private let directory: URL

    init(directory: URL? = nil) {
        if let directory {
            self.directory = directory
        } else {
            let support = FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask).first!
            self.directory = support.appendingPathComponent("FLOATDESK-Research",isDirectory:true)
        }
    }

    var isHeld: Bool { descriptor >= 0 }

    func acquire() throws {
        guard descriptor < 0 else { throw LockError.busy }
        try FileManager.default.createDirectory(at:directory,
            withIntermediateDirectories:true,
            attributes:[.posixPermissions: 0o700])
        let path = directory.appendingPathComponent("managed-local.lock").path
        let fd = Darwin.open(path,O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC,
                             mode_t(S_IRUSR | S_IWUSR))
        if fd < 0 { throw LockError.unavailable }
        var st = stat()
        if Darwin.fstat(fd,&st) != 0 ||
           (st.st_mode & mode_t(S_IFMT)) != mode_t(S_IFREG) ||
           (st.st_mode & 0o077) != 0 || st.st_uid != getuid() ||
           st.st_nlink != 1 {
            Darwin.close(fd)
            throw LockError.unsafeFile
        }
        if floatdeskFlock(fd, LOCK_EX | LOCK_NB) != 0 {
            Darwin.close(fd)
            throw LockError.busy
        }
        descriptor = fd
    }

    func release() {
        guard descriptor >= 0 else { return }
        floatdeskFlock(descriptor, LOCK_UN)
        Darwin.close(descriptor)
        descriptor = -1
    }
}
