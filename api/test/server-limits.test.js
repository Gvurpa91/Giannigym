// The HTTP edge of the API: oversized and malformed bodies must get a clean 4xx (not a
// reset connection or a 500), and the server must keep serving afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-limits-'));
const SECRET = crypto.randomBytes(32).toString('hex');
const PORT = 4100 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${PORT}`;
const uid = 'limits' + crypto.randomBytes(3).toString('hex');
const sign = p => p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
const cookie = 'gymsid=' + sign(uid + ':' + (Date.now() + 864e5) + ':0');
let srv;

before(async () => {
  fs.writeFileSync(path.join(DATA, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(DATA, 'db.json'), JSON.stringify({ users: [{ id: uid, name: 'limits' }], creds: [], subs: [], invites: [] }));
  srv = spawn(process.execPath, ['server.js'], { cwd: API, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, ko) => { srv.stdout.on('data', d => { if (/on :/.test(d)) ok(); }); setTimeout(() => ko(new Error('server did not start')), 8000); });
});
after(() => { srv?.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });

const put = raw => fetch(base + '/api/data', { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: raw });

test('a state under the 5 MB limit is stored', async () => {
  const r = await put(JSON.stringify({ state: { pad: 'x'.repeat(4.5e6) } }));
  assert.equal(r.status, 200);
});

test('a body over the limit gets 413, not a reset connection', async () => {
  const r = await put(JSON.stringify({ state: { pad: 'x'.repeat(5.5e6) } }));
  assert.equal(r.status, 413);
  assert.match((await r.json()).error, /too large/);
});

test('malformed JSON gets 400, not 500', async () => {
  const r = await put('{"state": {');
  assert.equal(r.status, 400);
});

test('the server keeps answering afterwards', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 200);
  const g = await fetch(base + '/api/data', { headers: { cookie } });
  assert.equal((await g.json()).state.pad.length, 4.5e6);
});
