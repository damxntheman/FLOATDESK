// FLOATDESK M15 — OFFLINE native consent research core.
//
// Deliberately not referenced by FloatdeskMacHost, Node, websocket handlers,
// click helper, Files helper, Terminal, capture, or the iPhone viewer.
// No IPC, network listener, OS permission, privileged effect, token issuance
// or remote owner-authentication is provided by this file.
//
// Inputs below are *trusted test fixtures*, NOT verified owner/viewer identities.
// A future signed Mac authority must obtain and authenticate device/session
// identity independently, display the exact verified scope on its local Mac UI,
// bind each grant to a real native resource, and enforce on every operation.
// Merely moving a JS ledger to Swift does not establish authentication.
import Foundation

@MainActor
final class FloatdeskNativeConsentResearch {
    enum Failure: Error { case denied }

    enum Capability: String, CaseIterable {
        case view, click, files, terminal, appLaunch
        var operations: Set<Operation> {
            switch self {
            case .view: return [.watch]
            case .click: return [.click]
            case .files: return [.list]
            case .terminal: return [.help, .date, .uptime, .system]
            case .appLaunch: return [.launch]
            }
        }
        var maximumTTL: UInt64 {
            switch self {
            case .click: return 120_000
            case .terminal: return 180_000
            default: return 300_000
            }
        }
    }
    enum Operation: String, Hashable {
        case watch, click, list, launch, help, date, uptime, system
    }
    private enum State { case active, disconnected, stopped }
    private struct ScopeKey: Hashable {
        let capability: Capability
        let opaqueScope: String
    }
    private struct Session {
        let viewerLabel: String
        var state: State
        var epoch: UInt64
        var revoked: [ScopeKey: UInt64]
    }
    struct Presentation: Equatable {
        let requestID: UUID
        let sessionID: UUID
        let viewerLabel: String
        let capability: Capability
        let opaqueScope: String
        let operations: Set<Operation>
        let requestedTTL: UInt64
        let approvalDeadline: UInt64
        let sessionEpoch: UInt64
        let revocationEpoch: UInt64
        // This is a UI-bound model snapshot, NOT a native user-approval proof.
    }
    struct GrantHandle {
        let id: UUID
        let generation: UUID
        // An opaque in-process label, NOT a transferable bearer credential.
    }
    struct Action {
        let grant: GrantHandle
        let sessionID: UUID
        let viewerLabel: String
        let capability: Capability
        let opaqueScope: String
        let operation: Operation
        let sequence: UInt64
    }
    struct Receipt { let id: UUID }

    private struct Grant {
        let sessionID: UUID
        let viewer: String
        let cap: Capability
        let scope: String
        let ops: Set<Operation>
        let sessionEpoch: UInt64
        let revokeEpoch: UInt64
        let expiry: UInt64
        var lastSequence: UInt64
        var active: Bool
    }

    let generation = UUID()
    private let clock: () -> UInt64
    private var lastTime: UInt64 = 0
    private var poisoned = false
    private var sessions: [UUID: Session] = [:]
    private var requests: [UUID: Presentation] = [:]
    private var grants: [UUID: Grant] = [:]
    private var receipts: [UUID: UUID] = [:]

    init(clock: @escaping () -> UInt64 = {
        DispatchTime.now().uptimeNanoseconds / 1_000_000
    }) {
        self.clock = clock
    }

    private func now() throws -> UInt64 {
        if poisoned { throw Failure.denied }
        let value = clock()
        if value < lastTime {
            poisoned = true
            requests.removeAll()
            receipts.removeAll()
            for id in Array(grants.keys) { grants[id]?.active = false }
            throw Failure.denied
        }
        lastTime = value
        return value
    }
    private func plus(_ timestamp: UInt64, _ delta: UInt64) throws -> UInt64 {
        let (result, overflow) = timestamp.addingReportingOverflow(delta)
        if overflow { throw Failure.denied }
        return result
    }
    private func validLabel(_ string: String) -> Bool {
        if string.isEmpty || string.utf8.count > 64 { return false }
        return string.utf8.allSatisfy {
            (48...57).contains($0) || (65...90).contains($0) ||
            (97...122).contains($0) || $0 == 95 || $0 == 45
        }
    }
    private func active(_ id: UUID) throws -> Session {
        guard let s = sessions[id], s.state == .active else { throw Failure.denied }
        return s
    }
    private func freshID<T>(_ dictionary: [UUID:T]) -> UUID {
        var id = UUID()
        while dictionary[id] != nil { id = UUID() }
        return id
    }

    // Research-only session enrollment. A real viewer identity MUST be
    // established by an independently verified native device-enrollment flow.
    func startSession(viewerLabel: String) throws -> UUID {
        _ = try now()
        guard validLabel(viewerLabel), sessions.count < 64 else { throw Failure.denied }
        let id = freshID(sessions)
        sessions[id] = Session(viewerLabel: viewerLabel,
                               state: .active, epoch: 0, revoked: [:])
        return id
    }

    // Calling begin never creates a permission. Even a compromised transport
    // may at most request a local presentation; no browser approval is trusted.
    func beginRequest(sessionID: UUID, capability: Capability,
                      opaqueScope: String, operations: Set<Operation>,
                      ttl: UInt64) throws -> Presentation {
        let time = try now()
        let session = try active(sessionID)
        guard validLabel(opaqueScope),
              !operations.isEmpty,
              operations.isSubset(of: capability.operations),
              ttl > 0, ttl <= capability.maximumTTL,
              requests.count < 128 else { throw Failure.denied }
        let key = ScopeKey(capability: capability, opaqueScope: opaqueScope)
        let p = Presentation(
            requestID: freshID(requests), sessionID: sessionID,
            viewerLabel: session.viewerLabel,
            capability: capability, opaqueScope: opaqueScope,
            operations: operations, requestedTTL: ttl,
            approvalDeadline: try plus(time, 30_000),
            sessionEpoch: session.epoch,
            revocationEpoch: session.revoked[key] ?? 0)
        requests[p.requestID] = p
        return p
    }

    // Intended ONLY for a future independently authenticated Mac-local UI
    // action. It is not exposed to Node, IPC, browser or any native helper.
    func approveFromLocalUI(_ shown: Presentation) throws -> GrantHandle {
        let time = try now()
        guard let pending = requests[shown.requestID], pending == shown,
              time < pending.approvalDeadline, grants.count < 2048 else {
            throw Failure.denied
        }
        let session = try active(pending.sessionID)
        let key = ScopeKey(capability: pending.capability,
                           opaqueScope: pending.opaqueScope)
        guard session.viewerLabel == pending.viewerLabel,
              session.epoch == pending.sessionEpoch,
              (session.revoked[key] ?? 0) == pending.revocationEpoch
        else { throw Failure.denied }
        let expiry = try plus(time, pending.requestedTTL)
        requests.removeValue(forKey: pending.requestID)
        let id = freshID(grants)
        grants[id] = Grant(
            sessionID: pending.sessionID, viewer: pending.viewerLabel,
            cap: pending.capability, scope: pending.opaqueScope,
            ops: pending.operations, sessionEpoch: session.epoch,
            revokeEpoch: pending.revocationEpoch, expiry: expiry,
            lastSequence: 0, active: true)
        return GrantHandle(id: id, generation: generation)
    }

    func denyRequest(_ requestID: UUID) throws {
        guard requests.removeValue(forKey: requestID) != nil
        else { throw Failure.denied }
    }

    // Explicit Mac-owner revocation fences both approved and still-pending
    // local prompts, even if the scope has never previously been approved.
    func revokeScope(sessionID: UUID, capability: Capability,
                     opaqueScope: String) throws {
        _ = try now()
        var session = try active(sessionID)
        guard validLabel(opaqueScope) else { throw Failure.denied }
        let key = ScopeKey(capability: capability, opaqueScope: opaqueScope)
        let epoch = session.revoked[key] ?? 0
        guard epoch < UInt64.max else { throw Failure.denied }
        if session.revoked[key] == nil && session.revoked.count >= 512 {
            stop(sessionID)
            throw Failure.denied
        }
        session.revoked[key] = epoch + 1
        sessions[sessionID] = session
        for id in Array(grants.keys) {
            if grants[id]?.sessionID == sessionID &&
                grants[id]?.cap == capability &&
                grants[id]?.scope == opaqueScope {
                grants[id]?.active = false
            }
        }
        requests = requests.filter {
            $0.value.sessionID != sessionID ||
            $0.value.capability != capability ||
            $0.value.opaqueScope != opaqueScope
        }
        dropInactiveReceipts()
    }
    private func dropInactiveReceipts() {
        receipts = receipts.filter { grants[$0.value]?.active == true }
    }

    // All lifecycle transitions are meant to be invoked only by the future
    // trusted native authority. They are not network-facing methods.
    func disconnect(_ id: UUID) throws {
        _ = try now()
        guard var s = sessions[id], s.state == .active,
              s.epoch < UInt64.max else { throw Failure.denied }
        s.epoch += 1; s.state = .disconnected; sessions[id] = s
        invalidate(id)
    }
    func resume(_ id: UUID, viewerLabel: String) throws {
        _ = try now()
        guard var s = sessions[id], s.state == .disconnected,
              s.viewerLabel == viewerLabel, s.epoch < UInt64.max else {
            throw Failure.denied
        }
        s.epoch += 1; s.state = .active; sessions[id] = s
        // Never restore previous grants on resume.
        invalidate(id)
    }
    func stop(_ id: UUID) {
        guard var s = sessions[id], s.state != .stopped else { return }
        s.state = .stopped; s.epoch = s.epoch == UInt64.max ? s.epoch : s.epoch + 1
        sessions[id] = s
        invalidate(id)
    }
    private func invalidate(_ id: UUID) {
        requests = requests.filter { $0.value.sessionID != id }
        for key in Array(grants.keys) where grants[key]?.sessionID == id {
            grants[key]?.active = false
        }
        receipts = receipts.filter {
            grants[$0.value]?.sessionID != id
        }
    }
    private func check(_ id: UUID, at time: UInt64) throws -> Grant {
        guard let grant = grants[id], grant.active, time < grant.expiry,
              let session = sessions[grant.sessionID],
              session.state == .active,
              session.epoch == grant.sessionEpoch,
              session.viewerLabel == grant.viewer,
              (session.revoked[ScopeKey(capability: grant.cap, opaqueScope: grant.scope)] ?? 0) == grant.revokeEpoch
        else { throw Failure.denied }
        return grant
    }

    // This returns only an IN-MEMORY research receipt. No macOS operation,
    // native helper command, screen, file listing or mouse event is dispatched.
    func authorize(_ action: Action) throws -> Receipt {
        let time = try now()
        guard action.grant.generation == generation,
              receipts.count < 256 else { throw Failure.denied }
        var grant = try check(action.grant.id, at: time)
        guard grant.sessionID == action.sessionID,
              grant.viewer == action.viewerLabel,
              grant.cap == action.capability,
              grant.scope == action.opaqueScope,
              grant.ops.contains(action.operation),
              grant.lastSequence < UInt64.max,
              action.sequence == grant.lastSequence + 1
        else { throw Failure.denied }
        let id = freshID(receipts)
        grant.lastSequence = action.sequence
        grants[action.grant.id] = grant
        receipts[id] = action.grant.id
        return Receipt(id: id)
    }

    // Rechecks BEFORE a future independently authorized side effect or
    // disclosure. Cannot undo an effect already sent to another process.
    func complete(_ receipt: Receipt) throws {
        let time = try now()
        guard let grantID = receipts.removeValue(forKey: receipt.id) else {
            throw Failure.denied
        }
        _ = try check(grantID, at: time)
    }
    func cancel(_ receipt: Receipt) throws {
        guard receipts.removeValue(forKey: receipt.id) != nil else {
            throw Failure.denied
        }
    }
}
