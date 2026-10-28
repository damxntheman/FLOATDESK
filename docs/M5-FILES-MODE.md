# M5 — FLOATDESK Files Mode (read-only metadata alpha)

**Code implemented; physical testing deliberately deferred.** The iPhone Files screen is a phone-friendly representation of a **Mac-owner-selected folder**. It is not a native iOS Files app, not a file transfer service, and not a full file manager.

## What M5 implements

- In the Mac app launcher, **canonical Finder** opens a phone-style **Files** screen. A separate button opens Finder on the Mac through the existing M3 app-launch permission, as a Desktop Mode fallback.
- Phone taps **Request folder access**; the trusted Mac host at localhost receives a pending request. The Mac owner must click **Choose folder on Mac** within 30 seconds, then explicitly choose a specific folder in a **native `NSOpenPanel`** dialog within 90 seconds. This helper is opted in by a separate compiled Swift binary path.
- Once selected, the phone receives a **read-only list of file and folder names, up to 100 entries per directory**. The phone can navigate subfolders and go up; files are displayed but cannot be opened or modified. The selected Mac folder's full path is never returned to the phone.
- Files Mode permission is independent of app launch, touch control and Terminal Preview. It expires after five minutes or upon Mac or phone revoke, disconnect, session end or browser socket replacement. The selected path is **in-memory only** and cleared on revoke.
- No file contents, file transfer, delete, rename, copy, terminal commands, recursive indexing, hidden files or symlink traversal. The phone cannot supply a Mac absolute folder path. A metadata-only policy checks paths against the selected root, rejects `..` and hidden segments, skips symbolic links and caps listing sizes.
- `FLOATDESK_FOLDER_PICKER_BIN` is **unset by default**, so Files Mode requests are rejected until the Mac owner explicitly compiles and opts in to the helper.

## Safe Mac build (when physical testing resumes)

Run on the **same MacBook where FLOATDESK is already configured**, not on the iPhone:

```sh
cd ~/FLOATDESK
git pull --ff-only
npm test
mkdir -p build
xcrun swiftc native/macos/FloatdeskFolderPicker.swift -o build/floatdesk-folder-picker
```

Restart the trusted HTTPS server on **port 8788** (leave SPECTRE on 8787):

```sh
HOST=0.0.0.0 PORT=8788 \
TLS_CERT_FILE=certs/lan.pem TLS_KEY_FILE=certs/lan-key.pem \
FLOATDESK_AGENT_BIN="$PWD/build/floatdesk-macos-agent" \
FLOATDESK_FOLDER_PICKER_BIN="$PWD/build/floatdesk-folder-picker" \
npm start
```

Mac Chrome: `https://localhost:8788`. Pair the iPhone Safari viewer as before. After the phone receives the app catalog, tapping **Finder** opens the phone Files screen. Request access; on the Mac click Choose folder; in the native picker select a **harmless, dedicated test folder** with non-sensitive names. The phone should list the names without screen sharing. The Mac should be able to revoke Files access independently of Desktop Mode.

Do **not** use your actual Projects, personal Documents, sensitive files, system folders or cloud-synced folders in the first tests. Avoid port forwarding and untrusted Wi-Fi.

## Important macOS limitations

Apple's native `NSOpenPanel` supports selecting directories. <https://developer.apple.com/documentation/appkit/nsopenpanel>.

**Security-scoped access:** This prototype has a **separate helper process**, but metadata reading currently occurs in the parent Node process; choosing a folder in the helper does **not** automatically transfer sandbox entitlements or macOS privacy/TCC authorization to Node. Some user-protected folders may therefore remain inaccessible, and no full macOS sandbox/security-scoped integration is claimed. A future signed Mac companion should own the picker and the file I/O in the same privilege domain, with security-scoped URLs/bookmarks and defense against symlink race attacks. <https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox>.

The Node metadata helper checks path containment before enumeration but is **not a hardened openat/fd-based directory traversal implementation**. Treat as trusted LAN research only; do not expose to the public internet or use with untrusted peers.

## Deferred mandatory device gate

- [ ] macOS Swift picker compiles/runs in the actual Mac GUI session, including cancel behavior; Node permission/TCC behavior understood.
- [ ] No Files access without Mac-local selection; no absolute path accepted from phone.
- [ ] Finder tile shows Files UI; navigation displays only names, no contents or secret paths.
- [ ] Revocation, expiry, socket loss and reconnection clear grants and visible listings.
- [ ] Forbidden traversal, symlinks and hidden names remain inaccessible on real Mac folders.
- [ ] Normal Finder Desktop Mode fallback still works under M3 app permission.
- [ ] No regression to Terminal Preview, Mac touch, responsive landscape Exit & revoke, PiP or preview.
- [ ] Run `npm test` on the Mac before claiming any hardware acceptance.

**Model routing:** Astra for native Mac access/security and protocol work; Opus for the later unified, premium iPhone Mode redesign. No physical tests are being requested now.
