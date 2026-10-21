// UI stress: a profile with years of history on a 4x-throttled CPU. Measures screen render
// times and the cost of one tap during a workout.
//   cd frontend && npm run build && npx vite preview --port 4173 &
//   node scripts/stress/ui-stress.mjs 1000 4      # workouts, CPU slowdown
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const { chromium, devices } = createRequire(path.join(HERE, '../../frontend/package.json'))('playwright')
const URL_BASE = process.env.APP_URL || 'http://127.0.0.1:4173'
const N = +(process.argv[2] || 1000), THROTTLE = +(process.argv[3] || 4)
const EX = ['0043', '0025', '0032', '0047', '0652', '1457', '0334']
function state(n) {
  const workouts = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2019, 0, 1) + i * 2.6 * 864e5).toISOString().slice(0, 10)
    return { id: 'w' + i, d, start: Date.parse(d), end: Date.parse(d) + 3600e3, routineId: 'r1', name: 'Full body A', bw: 84, vol: 5000, prs: i % 9 ? [] : ['0043'],
      entries: EX.map(id => ({ id, topW: null, target: { id, sets: 4, reps: 8, weight: 60, prog: 'linear' }, sets: Array.from({ length: 4 }, (_, k) => ({ w: 40 + (i % 40), r: 8 - (k > 2 ? 1 : 0), done: true })), ...(i % 6 ? {} : { note: 'Sedile al 4, presa larga' }) })) }
  })
  return { lang: 'it', unit: 'kg', routines: [{ id: 'r1', name: 'Full body A', ex: EX.map(id => ({ id, sets: 4, reps: 8, prog: 'linear' })) }], week: { 0: 'r1', 1: 'r1', 2: 'r1', 3: 'r1', 4: 'r1', 5: 'r1', 6: 'r1' },
    workouts, bodyweight: workouts.map(w => ({ d: w.d, w: 84 - (w.start % 7), t: w.start })), measures: workouts.filter((_, i) => i % 4 === 0).map(w => ({ d: w.d, waist: 92 })),
    exWeights: Object.fromEntries(EX.map(id => [id, { w: 80, d: '2026-10-01' }])), exNotes: { '0043': { text: 'Sedile al 4', d: '2026-10-01' } }, lastBackup: '2026-10-15' }
}
const S = state(N); const json = JSON.stringify(S)
console.log(`profile: ${N} workouts, ${S.bodyweight.length} weigh-ins, ${S.measures.length} measurements -> ${(json.length / 1048576).toFixed(2)} M chars`)
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'it-IT' })
const page = await ctx.newPage()
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto(URL_BASE + '/#/home', { waitUntil: 'networkidle' })
// how much does this browser accept?
const quota = await page.evaluate(() => { localStorage.clear(); let lo = 0, hi = 64 * 1024 * 1024; while (hi - lo > 65536) { const mid = (lo + hi) >> 1; try { localStorage.setItem('q', 'x'.repeat(mid)); lo = mid } catch { hi = mid } } localStorage.removeItem('q'); return lo })
console.log(`browser localStorage quota here: ~${(quota / 1048576).toFixed(1)} M chars`)
const fits = json.length < quota * 0.98
await page.evaluate(([j]) => { localStorage.setItem('gym_guest', '1'); try { localStorage.setItem('gym_state_v1', j) } catch (e) { console.error('seed failed ' + e.name) } }, [json])
const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300)
const timeRoute = async (hash, sel) => page.evaluate(async ([h, s]) => {
  const t0 = performance.now(); location.hash = h
  for (let i = 0; i < 400; i++) { await new Promise(r => requestAnimationFrame(r)); if (document.querySelector(s)) break }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  return Math.round(performance.now() - t0)
}, [hash, sel])
const rows = []
for (const [name, h, sel] of [['Home', '#/home', '.today-row'], ['Statistiche', '#/stats', '.tiles'], ['Storico', '#/history', '.list .item, .item'], ['Esercizi', '#/library', '.list .item'], ['Piano', '#/plan', '.hdr'], ['Home (di nuovo)', '#/home', '.today-row']]) {
  await timeRoute('#/settings', '.hdr'); rows.push([name, await timeRoute(h, sel)])
}
console.log(`\nscreen render (CPU x${THROTTLE}):`); rows.forEach(([n, ms]) => console.log(`  ${n.padEnd(18)} ${String(ms).padStart(5)} ms`))
// cost of one save: start a workout and tick sets
await page.evaluate(() => { location.hash = '#/home' }); await page.waitForTimeout(400)
await page.locator('button.start').first().click(); await page.waitForTimeout(400)
await page.getByText('Inizia senza pesarti', { exact: true }).click().catch(() => {}); await page.waitForTimeout(800)
const tick = await page.evaluate(async () => {
  const boxes = [...document.querySelectorAll('.setrow .check, .setrow [role=checkbox]')]
  const out = []
  for (const b of boxes.slice(0, 3)) { const t0 = performance.now(); b.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); out.push(Math.round(performance.now() - t0)) }
  return { n: boxes.length, ms: out }
})
console.log(`\ntap a set as done: ${tick.ms.join(', ')} ms  (${tick.n} set boxes found)`)
await page.waitForTimeout(600) // local writes are debounced by 300 ms
const saved = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('gym_state_v1') || '{}'); return { active: !!s.active, done: s.active ? s.active.entries[0].sets.filter(x => x.done).length : 0, workouts: (s.workouts || []).length } })
console.log(`after taps, localStorage: active workout ${saved.active}, sets done ${saved.done}, workouts ${saved.workouts}`)
console.log(`\nseed fit in storage: ${fits}`)
console.log(`page errors: ${errs.length}${errs.length ? '\n  ' + [...new Set(errs)].slice(0, 5).join('\n  ') : ''}`)
await browser.close()
