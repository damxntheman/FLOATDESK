// FLOATDESK M10: parent-bound local-only research dashboard.
//
// Run ONLY as the direct child of the Mac menu bar shell with an open stdin
// pipe. If that owner exits or crashes, the pipe closes and we exit. This is
// not a daemon, network-facing service, privilege broker, or production
// replacement for trusted-LAN HTTPS/PiP on 8788.
const expectedHost = '127.0.0.1';
const expectedPort = '8789';
if (process.env.HOST !== expectedHost || process.env.PORT !== expectedPort ||
    process.env.TLS_CERT_FILE || process.env.TLS_KEY_FILE ||
    process.stdin.isTTY) {
  process.stderr.write('Managed local host requires explicit loopback-only configuration.\n');
  process.exit(2);
}
let ownerClosed = false;
function shutdown() {
  if (ownerClosed) return;
  ownerClosed = true;
  // Child has no elevated capabilities, handles only Mac loopback traffic,
  // and is never a persistence mechanism. Exit also releases port 8789.
  process.exit(0);
}
process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);
process.stdin.on('error', shutdown);
process.stdin.resume();

// Attach parent-death handling BEFORE importing the server. No parent pipe
// means EOF and immediate shutdown, even when started in an automated runner.
await import('./server.js');
