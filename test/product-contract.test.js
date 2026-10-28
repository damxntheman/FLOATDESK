import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('PiP remains a supported core viewer action during iPhone Mode development', () => {
  const html = read('../public/index.html');
  const js = read('../public/client.js');
  const roadmap = read('../docs/ROADMAP.md');
  const readme = read('../README.md');
  assert.match(html, /id="pip"/);
  assert.match(js, /requestPictureInPicture/);
  assert.match(js, /webkitSetPresentationMode\('picture-in-picture'\)/);
  assert.match(roadmap, /Picture-in-Picture is core/);
  assert.match(readme, /PiP must not be removed/);
});
test('public setup docs avoid copying an example home network address', () => {
  for (const file of ['../README.md', '../docs/TESTING.md']) {
    const docs = read(file);
    assert.doesNotMatch(docs, /\b192\.168\.\d{1,3}\.\d{1,3}\b/);
    assert.match(docs, /YOUR-MAC-LAN-IP|MAC_LAN_IP/);
  }
});


test('M9 Mac menu service stays loopback-only and preserves existing video paths', () => {
  const shell = read('../native/macos/FloatdeskMacHost.swift');
  const service = read('../native/macos/FloatdeskLocalService.swift');
  const server = read('../src/server.js');
  const client = read('../public/client.js');
  assert.match(shell, /startLocalService/);
  assert.match(shell, /stopLocalService/);
  assert.match(shell, /localService\.stop\(\)/);
  assert.match(service, /"HOST": "127\.0\.0\.1"/);
  assert.match(service, /"PORT": Self\.port/);
  assert.match(service, /static let port = "8789"/);
  assert.match(service, /process\.environment = \[/);
  assert.doesNotMatch(service, /"HOST": "0\.0\.0\.0"/);
  assert.match(client, /requestPictureInPicture/);
  assert.match(server, /capture-state/);
});
