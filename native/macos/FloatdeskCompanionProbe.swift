// FLOATDESK M6 — unprivileged native companion handshake probe.
// Build on macOS using:
//   mkdir -p build
//   xcrun swiftc native/macos/FloatdeskCompanionProbe.swift -o build/floatdesk-companion-probe
//
// This is NOT a screen capturer, input agent, file broker, terminal host, or
// background daemon. It accepts exactly one versioned JSON hello on stdin,
// prints one fixed capability reply, and exits. PiP stays in the existing
// WebRTC viewer until a separately verified native iOS video path exists.
//
// IMPORTANT: no machine identity, username, folder, executable, network
// configuration or authentication credential is returned.
import Foundation

struct Hello: Decodable {
    let version: Int
    let type: String
    let requestId: String
}
struct CapabilitySet: Encodable {
    let capture = false
    let input = false
    let files = false
    let terminal = false
}
struct HelloAck: Encodable {
    let version = 1
    let type = "hello-ack"
    let requestId: String
    let platform = "macos"
    let capabilities = CapabilitySet()
}
func reject() -> Never {
    fputs("FLOATDESK companion handshake rejected\n", stderr)
    exit(2)
}
guard let line = readLine(strippingNewline: true),
      line.utf8.count <= 1024,
      let data = line.data(using: .utf8),
      let request = try? JSONDecoder().decode(Hello.self, from: data),
      request.version == 1,
      request.type == "hello",
      request.requestId.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil
else { reject() }
let response = HelloAck(requestId: request.requestId)
guard let output = try? JSONEncoder().encode(response),
      let reply = String(data: output, encoding: .utf8)
else { reject() }
print(reply)
fflush(stdout)
