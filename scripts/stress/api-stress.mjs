// API stress test: boots the real server on a temp data dir with N users and signed session
// cookies (passkeys need a device), then measures throughput, concurrent writes, size limits
// and hostile input.
//   cd api && npm ci && node ../scripts/stress/api-stress.mjs . 50
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const API = path.resolve(process.argv[2]); const N = +(process.argv[3] || 50)
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-stress-'))
const SECRET = crypto.randomBytes(32).toString('hex')
fs.writeFileSync(path.join(DATA, 'secret'), SECRET, { mode: 0o600 })
const users = Array.from({ length: N }, (_, i) => ({ id: 'u' + i.toString().padStart(3, '0') + crypto.randomBytes(4).toString('hex'), name: 'user' + i, created: new Date().toISOString() }))
fs.writeFileSync(path.join(DATA, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites: [] }))
const sign = p => p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url')
const cookie = u => 'gymsid=' + sign(u.id + ':' + (Date.now() + 864e5) + ':0')
const PORT = 3900 + Math.floor(Math.random() * 90)
const srv = spawn(process.execPath, ['server.js'], { cwd: API, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'pipe'] })
let srvErr = ''; srv.stderr.on('data', d => { srvErr += d })
await new Promise((ok, ko) => { srv.stdout.on('data', d => { if (/on :/.test(d)) ok() }); setTimeout(() => ko(new Error('server did not start: ' + srvErr)), 8000) })
const base = `http://127.0.0.1:${PORT}`
const req = async (method, p, { body, ck, raw } = {}) => {
  const t0 = performance.now()
  try {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) })
    const txt = await r.text()
    return { status: r.status, ms: performance.now() - t0, txt }
  } catch (e) { return { status: 'ERR:' + (e.cause?.code || e.message), ms: performance.now() - t0, txt: '' } }
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))] }
const stats = (name, rs) => {
  const ms = rs.map(r => r.ms); const bad = rs.filter(r => r.status !== 200)
  const codes = {}; rs.forEach(r => { codes[r.status] = (codes[r.status] || 0) + 1 })
  console.log(`${name.padEnd(34)} n=${rs.length} p50=${pct(ms, 50).toFixed(1)}ms p95=${pct(ms, 95).toFixed(1)}ms p99=${pct(ms, 99).toFixed(1)}ms max=${Math.max(...ms).toFixed(0)}ms non-200=${bad.length} ${JSON.stringify(codes)}`)
  return bad.length
}
async function pool(n, conc, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < n) { const k = i++; out[k] = await fn(k) } })); return out }
const rss = () => { try { return Math.round(+fs.readFileSync(`/proc/${srv.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024) } catch { return -1 } }

// realistic state: ~2 years at 2-3 sessions/week, 7 exercises, 3-4 sets each
function makeState(nWorkouts, tag = '') {
  const ex = ['0043', '0025', '0032', '0047', '0652', '1457', '0334']
  const workouts = Array.from({ length: nWorkouts }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1) + i * 2.8 * 864e5).toISOString().slice(0, 10)
    return { id: 'w' + i + tag, d, start: Date.parse(d), end: Date.parse(d) + 3600e3, routineId: 'r1', name: 'Full body A', bw: 84, vol: 5000, prs: [],
      entries: ex.map(id => ({ id, topW: null, target: { id, sets: 4, reps: 8, weight: 60, prog: 'linear' }, sets: Array.from({ length: 4 }, () => ({ w: 60 + (i % 10), r: 8, done: true })), note: i % 5 ? undefined : 'Sedile al 4, presa larga' })) }
  })
  return { _ts: Date.now(), lang: 'it', unit: 'kg', routines: [{ id: 'r1', name: 'Full body A', ex: ex.map(id => ({ id, sets: 4, reps: 8 })) }], week: { 1: 'r1', 4: 'r1' }, workouts,
    bodyweight: workouts.map(w => ({ d: w.d, w: 84, t: w.start })), measures: workouts.filter((_, i) => i % 4 === 0).map(w => ({ d: w.d, waist: 92 })), exNotes: { '0043': { text: 'x', d: '2026-10-01' } } }
}
let failures = 0
const r0 = rss()
console.log(`server pid ${srv.pid}, ${N} users, data ${DATA}, RSS ${r0} MB\n`)

// 1. health throughput
failures += stats('1. health  2000 req / 50 conc', await pool(2000, 50, () => req('GET', '/api/health')))

// 2. every user uploads a 2-year history, then 10 rounds of concurrent saves
const st = makeState(260); const stBytes = JSON.stringify({ state: st }).length
console.log(`   (state with 260 workouts = ${(stBytes / 1024).toFixed(0)} KB per PUT)`)
failures += stats(`2. PUT data  ${N}x10 / 25 conc`, await pool(N * 10, 25, k => req('PUT', '/api/data', { ck: cookie(users[k % N]), body: { state: { ...st, _ts: k } } })))
failures += stats(`3. GET data  ${N}x10 / 25 conc`, await pool(N * 10, 25, k => req('GET', '/api/data', { ck: cookie(users[k % N]) })))
// integrity: every file parses and has the last round's data
let corrupt = 0, tmpLeft = 0
for (const u of users) { try { const s = JSON.parse(fs.readFileSync(path.join(DATA, `state-${u.id}.json`), 'utf8')); if (s.workouts.length !== 260 || 'active' in s) corrupt++ } catch { corrupt++ } }
tmpLeft = fs.readdirSync(DATA).filter(f => f.endsWith('.tmp')).length
console.log(`   integrity: ${corrupt} corrupt state files, ${tmpLeft} leftover .tmp files`)
failures += corrupt + tmpLeft

// 4. one user, 200 simultaneous saves from "two devices": file must be one of the payloads, never a mix
const u0 = users[0]
const rs4 = await pool(200, 100, k => req('PUT', '/api/data', { ck: cookie(u0), body: { state: { ...makeState(40, 'k' + k), _ts: k } } }))
failures += stats('4. same user 200 PUT / 100 conc', rs4)
{ const s = JSON.parse(fs.readFileSync(path.join(DATA, `state-${u0.id}.json`), 'utf8')); const tags = new Set(s.workouts.map(w => w.id.replace(/^w\d+/, ''))); console.log(`   final file holds ${tags.size} payload(s): ${tags.size === 1 ? 'consistent' : 'MIXED'}`); if (tags.size !== 1) failures++ }

// 5. size limits
const big = makeState(Math.floor(4.4e6 / (stBytes / 260)))
const bigBytes = JSON.stringify({ state: big }).length
const r5a = await req('PUT', '/api/data', { ck: cookie(users[1]), body: { state: big } })
console.log(`5a. PUT ${(bigBytes / 1048576).toFixed(2)} MB (under 5 MB limit)  -> ${r5a.status} in ${r5a.ms.toFixed(0)} ms`)
if (r5a.status !== 200) failures++
const huge = makeState(Math.floor(5.6e6 / (stBytes / 260)))
const r5b = await req('PUT', '/api/data', { ck: cookie(users[2]), body: { state: huge } })
console.log(`5b. PUT ${(JSON.stringify({ state: huge }).length / 1048576).toFixed(2)} MB (over limit)        -> ${r5b.status} ${r5b.txt.slice(0, 60)}  (want 413)`)
if (r5b.status !== 413) failures++
const alive = await req('GET', '/api/health'); console.log(`    server still answering after oversize: ${alive.status}`); if (alive.status !== 200) failures++

// 6. hostile input
const checks = [
  ['6a. bad JSON body', await req('PUT', '/api/data', { ck: cookie(users[3]), raw: '{"state": {' }), 400],
  ['6b. no cookie', await req('GET', '/api/data'), 401],
  ['6c. forged cookie', await req('GET', '/api/data', { ck: 'gymsid=' + users[3].id + ':' + (Date.now() + 864e5) + ':0.AAAA' }), 401],
  ['6d. expired cookie', await req('GET', '/api/data', { ck: 'gymsid=' + sign(users[3].id + ':' + (Date.now() - 1000) + ':0') }), 401],
  ['6e. state not an object', await req('PUT', '/api/data', { ck: cookie(users[3]), body: { state: 'x' } }), 400],
  ['6f. path traversal in uid', await req('GET', '/api/data', { ck: 'gymsid=' + sign('../../etc/passwd:' + (Date.now() + 864e5) + ':0') }), 401],
  ['6g. unknown route', await req('GET', '/api/nope'), 404],
]
for (const [name, r, want] of checks) { const ok = r.status === want; console.log(`${name.padEnd(34)} -> ${r.status} (want ${want}) ${ok ? 'ok' : 'FAIL'}`); if (!ok) failures++ }

// 7. sustained mixed load
const t7 = performance.now()
const rs7 = await pool(3000, 60, k => k % 3 ? req('GET', '/api/data', { ck: cookie(users[k % N]) }) : req('PUT', '/api/data', { ck: cookie(users[k % N]), body: { state: { ...st, _ts: k } } }))
failures += stats('7. mixed 3000 req / 60 conc', rs7)
console.log(`   throughput ${(3000 / ((performance.now() - t7) / 1000)).toFixed(0)} req/s, RSS ${r0} -> ${rss()} MB`)
const still = await req('GET', '/api/health'); if (still.status !== 200) failures++
srv.kill()
console.log(`\nserver stderr lines: ${srvErr.split('\n').filter(Boolean).length}${srvErr ? '\n' + srvErr.split('\n').filter(Boolean).slice(0, 4).join('\n') : ''}`)
console.log(`RESULT: ${failures ? failures + ' FAILURE(S)' : 'all checks passed'}`)
fs.rmSync(DATA, { recursive: true, force: true })
process.exit(failures ? 1 : 0)
