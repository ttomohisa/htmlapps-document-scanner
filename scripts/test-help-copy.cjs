'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const argument = process.argv.indexOf('--html');
const file = argument >= 0 ? process.argv[argument + 1] : path.join(__dirname, '../src/index.template.html');
let html = fs.readFileSync(file, 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/)
  || html.match(/const b=atob\(["']([A-Za-z0-9+/=]+)["']\)/)
  || html.match(/const b=["']([A-Za-z0-9+/=]+)["'],raw=Uint8Array/);
if (payload) html = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
assert.match(html, /APP:HELP:BEGIN/, 'Inspect the decoded application, not the self-extract loader');
const excluded = [
  "画面が低いときはスクロールして開始・画像ボタンを表示します。",
  " On short screens, scroll to reach Start camera and Image."
];
for (const text of excluded) {
  assert.equal(html.includes(text), false, `User-facing help must exclude obsolete audit/implementation copy: ${text}`);
}
console.log('User-facing help copy regression passed.');
