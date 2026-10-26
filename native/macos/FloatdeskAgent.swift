// FLOATDESK M2 research-only macOS input agent.
// Receives newline-delimited JSON on stdin, only from the locally started
// FLOATDESK Node process. It NEVER listens on a network socket.
// Build explicitly with: swiftc native/macos/FloatdeskAgent.swift -o build/floatdesk-macos-agent
import Foundation
import ApplicationServices
import CoreGraphics

func reply(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

guard AXIsProcessTrusted() else {
    reply(["type": "error", "message": "Mac Accessibility permission is missing for the input agent. Enable it in System Settings > Privacy & Security > Accessibility, then restart FLOATDESK."])
    exit(1)
}
var ids = [CGDirectDisplayID](repeating: 0, count: 8)
var count: UInt32 = 0
guard CGGetActiveDisplayList(UInt32(ids.count), &ids, &count) == .success, count == 1 else {
    reply(["type": "error", "message": "Touch control requires exactly one active Mac display. Unplug external displays first."])
    exit(1)
}
let screen = CGDisplayBounds(CGMainDisplayID())
guard screen.width > 0, screen.height > 0 else {
    reply(["type": "error", "message": "Could not resolve Mac display coordinates."])
    exit(1)
}
reply(["type": "ready", "displays": Int(count)])
while let line = readLine() {
    if line.utf8.count > 1024 { continue }
    guard let data = line.data(using: .utf8),
          let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          command["type"] as? String == "click",
          let x = command["x"] as? Double, let y = command["y"] as? Double,
          x.isFinite, y.isFinite, (0...1).contains(x), (0...1).contains(y) else { continue }
    // Video coordinates are normalized to the single captured Mac monitor.
    let point = CGPoint(x: screen.minX + screen.width * x, y: screen.minY + screen.height * y)
    guard let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
          let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left) else { continue }
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}
