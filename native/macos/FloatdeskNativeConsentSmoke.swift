// FLOATDESK M15 CI-only offline research fixture.
// Compiles on macOS; does not open GUI, socket, Files, Accessibility or video.
// The mock viewer labels are UNAUTHENTICATED and cannot become live grants.
import Foundation

@MainActor
private final class TestClock {
    var milliseconds: UInt64 = 1_000
}
private enum TestError: Error { case failure(String) }
@MainActor
private func check(_ flag: @autoclosure () -> Bool, _ reason: String) throws {
    if !flag() { throw TestError.failure(reason) }
}
@MainActor
private func denied(_ reason: String, _ work: () throws -> Void) throws {
    do { try work() }
    catch FloatdeskNativeConsentResearch.Failure.denied { return }
    catch { throw TestError.failure("Unexpected error: \(reason)") }
    throw TestError.failure("Unexpected permit: \(reason)")
}

@MainActor
private struct Scenario {
    let clock: TestClock
    let core: FloatdeskNativeConsentResearch
    let session: UUID
    let presentation: FloatdeskNativeConsentResearch.Presentation
    let grant: FloatdeskNativeConsentResearch.GrantHandle
    init(capability: FloatdeskNativeConsentResearch.Capability = .files,
         scope: String = "test_root",
         operations: Set<FloatdeskNativeConsentResearch.Operation> = [.list],
         ttl: UInt64 = 5_000) throws {
        clock = TestClock()
        core = FloatdeskNativeConsentResearch(clock: { [clock] in clock.milliseconds })
        session = try core.startSession(viewerLabel: "fixture_viewer")
        presentation = try core.beginRequest(
            sessionID: session, capability: capability,
            opaqueScope: scope, operations: operations, ttl: ttl)
        grant = try core.approveFromLocalUI(presentation)
    }
    func action(_ operation: FloatdeskNativeConsentResearch.Operation = .list,
                seq: UInt64 = 1,
                scope: String = "test_root") -> FloatdeskNativeConsentResearch.Action {
        .init(grant: grant, sessionID: session, viewerLabel: "fixture_viewer",
              capability: presentation.capability, opaqueScope: scope,
              operation: operation, sequence: seq)
    }
}

@main
enum FloatdeskNativeConsentSmoke {
    @MainActor
    static func main() {
        do {
            try run()
            print("M15 native consent core: 13 offline scenarios passed")
        } catch {
            fputs("M15 native consent core failed\n",stderr)
            exit(2)
        }
    }
    @MainActor
    static func run() throws {
        // 1: no grant until explicit local UI approval.
        do {
            let c = TestClock()
            let core = FloatdeskNativeConsentResearch(clock:{c.milliseconds})
            let session = try core.startSession(viewerLabel:"fixture_viewer")
            let p = try core.beginRequest(sessionID:session, capability:.files,
                                          opaqueScope:"root",operations:[.list],ttl:5000)
            try check(p.viewerLabel=="fixture_viewer","presentation binds viewer")
            try denied("cannot spoof displayed details") {
                try core.approveFromLocalUI(.init(
                    requestID:p.requestID,sessionID:p.sessionID,
                    viewerLabel:"other",capability:p.capability,
                    opaqueScope:p.opaqueScope,operations:p.operations,
                    requestedTTL:p.requestedTTL,approvalDeadline:p.approvalDeadline,
                    sessionEpoch:p.sessionEpoch,revocationEpoch:p.revocationEpoch))
                .map {_ in}
            }
            _ = try core.approveFromLocalUI(p)
            try denied("approval cannot be reused") {
                _ = try core.approveFromLocalUI(p)
            }
        }

        // 2: capability and exact scope cannot be confused.
        do {
            let x = try Scenario()
            try denied("wrong scope") {_ = try x.core.authorize(x.action(scope:"other"))}
            try denied("wrong operation") {_ = try x.core.authorize(x.action(.click))}
            let r = try x.core.authorize(x.action())
            try x.core.complete(r)
        }

        // 3: repeat, gap and forged viewer fail without consuming sequence.
        do {
            let x = try Scenario()
            try denied("sequence gap") {_ = try x.core.authorize(x.action(seq:2))}
            let original=x.action()
            let spoof=FloatdeskNativeConsentResearch.Action(
                grant:x.grant,sessionID:x.session,viewerLabel:"other",
                capability:.files,opaqueScope:"test_root",operation:.list,sequence:1)
            try denied("viewer mismatch") {_ = try x.core.authorize(spoof)}
            _ = try x.core.authorize(original)
            try denied("replay") {_ = try x.core.authorize(original)}
            let r=try x.core.authorize(x.action(seq:2))
            try x.core.complete(r)
        }

        // 4: completion is one-use, expiry closes at exact deadline.
        do {
            let x=try Scenario()
            let receipt=try x.core.authorize(x.action())
            x.clock.milliseconds=6_000
            try denied("expiry exactly at boundary") {try x.core.complete(receipt)}
            try denied("no new operations at expiry") {
                _ = try x.core.authorize(x.action(seq:2))
            }
        }

        // 5: revocation fences in-flight receipt and pending UI approval.
        do {
            let x=try Scenario()
            let receipt=try x.core.authorize(x.action())
            let p=try x.core.beginRequest(sessionID:x.session,capability:.files,
                                           opaqueScope:"test_root",operations:[.list],ttl:1000)
            try x.core.revokeScope(sessionID:x.session,capability:.files,opaqueScope:"test_root")
            try denied("revoked receipt") {try x.core.complete(receipt)}
            try denied("revoked prompt") {_ = try x.core.approveFromLocalUI(p)}
            try denied("revoked grant") {_ = try x.core.authorize(x.action(seq:2))}
        }

        // 6: independent scopes are unaffected by a separate scope revoke.
        do {
            let x=try Scenario()
            let p=try x.core.beginRequest(sessionID:x.session,capability:.files,
                                         opaqueScope:"second_root",operations:[.list],ttl:5000)
            let g=try x.core.approveFromLocalUI(p)
            try x.core.revokeScope(sessionID:x.session,capability:.files,opaqueScope:"test_root")
            let a=FloatdeskNativeConsentResearch.Action(
                grant:g,sessionID:x.session,viewerLabel:"fixture_viewer",
                capability:.files,opaqueScope:"second_root",operation:.list,sequence:1)
            try x.core.complete(x.core.authorize(a))
        }

        // 7: a revocation before approval rejects the old prompt.
        do {
            let c=TestClock()
            let x=FloatdeskNativeConsentResearch(clock:{c.milliseconds})
            let id=try x.startSession(viewerLabel:"fixture_viewer")
            let p=try x.beginRequest(sessionID:id,capability:.click,
                                     opaqueScope:"screen",operations:[.click],ttl:1000)
            try x.revokeScope(sessionID:id,capability:.click,opaqueScope:"screen")
            try denied("stale prompt") {_ = try x.approveFromLocalUI(p)}
            let fresh=try x.beginRequest(sessionID:id,capability:.click,
                                         opaqueScope:"screen",operations:[.click],ttl:1000)
            _ = try x.approveFromLocalUI(fresh)
        }

        // 8: pending prompt expires even if user tries to approve late.
        do {
            let c=TestClock()
            let x=FloatdeskNativeConsentResearch(clock:{c.milliseconds})
            let id=try x.startSession(viewerLabel:"fixture_viewer")
            let p=try x.beginRequest(sessionID:id,capability:.files,
                                     opaqueScope:"root",operations:[.list],ttl:1000)
            c.milliseconds=31_000
            try denied("prompt expiry") {_ = try x.approveFromLocalUI(p)}
        }

        // 9: disconnect/resume always revokes, even same viewer.
        do {
            let x=try Scenario()
            let r=try x.core.authorize(x.action())
            try x.core.disconnect(x.session)
            try denied("disconnect receipt") {try x.core.complete(r)}
            try denied("wrong viewer resume") {
                try x.core.resume(x.session,viewerLabel:"other")
            }
            try x.core.resume(x.session,viewerLabel:"fixture_viewer")
            try denied("old grant after reconnect") {
                _ = try x.core.authorize(x.action(seq:2))
            }
        }

        // 10: stop is terminal.
        do {
            let x=try Scenario()
            x.core.stop(x.session)
            try denied("stopped session cannot resume") {
                try x.core.resume(x.session,viewerLabel:"fixture_viewer")
            }
        }

        // 11: generation swap rejects cross-process grant handles.
        do {
            let x=try Scenario()
            let y=try Scenario()
            let swapped=FloatdeskNativeConsentResearch.Action(
                grant:x.grant,sessionID:y.session,viewerLabel:"fixture_viewer",
                capability:.files,opaqueScope:"test_root",operation:.list,sequence:1)
            try denied("old process handle") {_ = try y.core.authorize(swapped)}
            try check(x.core.generation != y.core.generation,"fresh generation")
        }

        // 12: view-only PiP never authorizes a click.
        do {
            let x=try Scenario(capability:.view,operations:[.watch])
            try denied("PiP never click") {_ = try x.core.authorize(x.action(.click))}
            let a=x.action(.watch)
            try x.core.complete(x.core.authorize(a))
            try denied("invalid click request") {
                _ = try x.core.beginRequest(sessionID:x.session,
                    capability:.view,opaqueScope:"test_root",operations:[.click],ttl:1000)
            }
        }

        // 13: clock rollback poisons all future grants; bounded prompts.
        do {
            let x=try Scenario()
            x.clock.milliseconds=999
            try denied("rollback") {_ = try x.core.authorize(x.action())}
            x.clock.milliseconds=1_000
            try denied("poisoned authority") {_ = try x.core.authorize(x.action())}
            let c=TestClock()
            let core=FloatdeskNativeConsentResearch(clock:{c.milliseconds})
            let session=try core.startSession(viewerLabel:"fixture_viewer")
            for i in 0..<128 {
                _ = try core.beginRequest(sessionID:session,
                    capability:.files,opaqueScope:"root_\(i)",
                    operations:[.list],ttl:1000)
            }
            try denied("prompt exhaustion") {
                _ = try core.beginRequest(sessionID:session,
                    capability:.files,opaqueScope:"overflow",
                    operations:[.list],ttl:1000)
            }
        }
    }
}
