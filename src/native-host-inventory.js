/**
 * M8: local-only inventory for the Mac operator.
 *
 * This is NOT a permission API, code-signature audit or endorsement of
 * configured executables. "configured" means a plausible file is present,
 * NOT that macOS TCC, signing, app sandbox or device operation has passed.
 * No paths, user IDs, machine names or LAN addresses leave this module.
 */
import { lstatSync } from 'node:fs';

export const SERVICES = Object.freeze([
  Object.freeze({ id:'nativeFiles', env:'FLOATDESK_NATIVE_FILES_BIN', title:'Native Files broker' }),
  Object.freeze({ id:'legacyPicker', env:'FLOATDESK_FOLDER_PICKER_BIN', title:'Legacy Files picker' }),
  Object.freeze({ id:'touchAgent', env:'FLOATDESK_AGENT_BIN', title:'Touch click agent' }),
  Object.freeze({ id:'companionProbe', env:'FLOATDESK_COMPANION_BIN', title:'Companion handshake' })
]);

export function inspectNativeServices({
  platform=process.platform,
  env=process.env,
  lstat=lstatSync
}={}) {
  const services=SERVICES.map(service=>{
    const file=env[service.env];
    if (!file) return {id:service.id,title:service.title,status:'disabled'};
    if (platform!=='darwin') return {id:service.id,title:service.title,status:'unsupported'};
    if (typeof file!=='string' || !file.startsWith('/') || file.includes('\0') ||
        file.includes('\n')) {
      return {id:service.id,title:service.title,status:'invalid'};
    }
    try {
      const stat=lstat(file);
      // Reject a symlink executable and basic untrusted file modes. An
      // independently signed/verified app and parent-chain audit are required
      // before this can become a production execution trust decision.
      if (!stat.isFile() || stat.isSymbolicLink() ||
          (stat.mode & 0o111) === 0 || (stat.mode & 0o022) !== 0) {
        return {id:service.id,title:service.title,status:'invalid'};
      }
      return {id:service.id,title:service.title,status:'configured'};
    } catch {
      return {id:service.id,title:service.title,status:'missing'};
    }
  });
  return {
    version:1,
    mode:'research',
    pip:{transport:'browser-webrtc',viewOnly:true,requiresCaptureConsent:true},
    services,
    verification:'Device permissions, signature identity and native behavior remain unverified.'
  };
}
