// Exhaustive sweep of every profile the questionnaire can produce (and every single piece of
// equipment on its own): the builder must never throw, never exceed the session length,
// never pick equipment the user does not have, never repeat an exercise inside a day, and
// always produce a plan that survives the share/import round trip.
import { describe, it, expect } from 'vitest'
import { buildProgram, toPlanFile, estimateMinutes, GOALS, EXPERIENCE } from './program-builder.js'
import { EXIDX, EXDB } from './exercises.js'
import { parsePlan } from './plan-share.js'

const SESSION = [30, 45, 60, 75, 90]
const DAYS = [1, 2, 3, 4, 5, 6]
const PRESETS = { full: [], dumbbells: ['dumbbell', 'body weight'], bodyweight: ['body weight'], bands: ['band', 'resistance band', 'body weight'] }
const TOP_EQ = (() => { const c = {}; EXDB.forEach(e => { if (e.eq) c[e.eq] = (c[e.eq] || 0) + 1 }); return Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 14) })()
const TOLERANCE = 5 // minutes

function check(profile) {
  const problems = []
  let b
  try { b = buildProgram(profile) } catch (e) { return ['threw: ' + e.message] }
  if (!b || !b.routines || !b.routines.length) return ['no routines']
  for (const r of b.routines) {
    if (!r.ex.length) { problems.push(`${r.name}: empty`); continue }
    const mins = estimateMinutes(r, profile.sessionMin)
    if (mins > profile.sessionMin + TOLERANCE) problems.push(`${r.name}: ${mins} min > ${profile.sessionMin}`)
    const seen = new Set()
    for (const e of r.ex) {
      const ex = EXIDX[e.id]
      if (!ex) { problems.push(`${r.name}: unknown id ${e.id}`); continue }
      if (seen.has(e.id)) problems.push(`${r.name}: ${ex.n} twice`)
      seen.add(e.id)
      // body weight is always available by design (program-builder.js `available`)
      if (profile.equipment.length && ex.eq !== 'body weight' && !profile.equipment.includes(ex.eq)) problems.push(`${r.name}: ${ex.n} needs ${ex.eq}`)
      if (!(e.sets > 0)) problems.push(`${r.name}: ${ex.n} has ${e.sets} sets`)
    }
  }
  try { const plan = parsePlan(toPlanFile(b)); if (plan.routines.length !== b.routines.length) problems.push('round trip lost routines') }
  catch (e) { problems.push('round trip: ' + e.message) }
  return problems
}

describe('program builder — every questionnaire combination', () => {
  const profiles = []
  for (const goal of GOALS) for (const experience of EXPERIENCE) for (const daysPerWeek of DAYS)
    for (const sessionMin of SESSION) for (const [preset, equipment] of Object.entries(PRESETS))
      profiles.push({ goal, experience, daysPerWeek, sessionMin, equipment, avoid: [], _preset: preset })

  it(`builds ${profiles.length} profiles without a single problem`, () => {
    const bad = []
    for (const p of profiles) { const pr = check(p); if (pr.length) bad.push(`${p.goal}/${p.experience}/${p.daysPerWeek}d/${p.sessionMin}m/${p._preset}: ${pr.join('; ')}`) }
    expect(bad.slice(0, 15)).toEqual([])
  })

  it('is deterministic', () => {
    for (const p of profiles.filter((_, i) => i % 97 === 0)) expect(JSON.stringify(buildProgram(p))).toBe(JSON.stringify(buildProgram(p)))
  })
})

describe('program builder — one piece of equipment only', () => {
  it(`handles each of the ${TOP_EQ.length} most common equipment types on its own`, () => {
    const bad = []
    for (const eq of TOP_EQ) for (const goal of GOALS) for (const daysPerWeek of [2, 3]) for (const sessionMin of [45, 60]) {
      const p = { goal, experience: 'returning', daysPerWeek, sessionMin, equipment: [eq], avoid: [] }
      const pr = check(p)
      if (pr.length) bad.push(`${eq}/${goal}/${daysPerWeek}d/${sessionMin}m: ${pr.join('; ')}`)
    }
    expect(bad.slice(0, 15)).toEqual([])
  })
})

describe('program builder — hostile avoid lists', () => {
  it('copes when most of the library is excluded', () => {
    const avoid = EXDB.filter((_, i) => i % 3 !== 0).map(e => e.id)   // two thirds of everything
    for (const goal of GOALS) expect(check({ goal, experience: 'regular', daysPerWeek: 3, sessionMin: 60, equipment: [], avoid })).toEqual([])
  })
  it('never picks an excluded exercise', () => {
    const first = buildProgram({ goal: 'muscle', experience: 'regular', daysPerWeek: 3, sessionMin: 60, equipment: [], avoid: [] })
    const avoid = first.routines.flatMap(r => r.ex.map(e => e.id))
    const again = buildProgram({ goal: 'muscle', experience: 'regular', daysPerWeek: 3, sessionMin: 60, equipment: [], avoid })
    const picked = again.routines.flatMap(r => r.ex.map(e => e.id))
    expect(picked.filter(id => avoid.includes(id))).toEqual([])
  })
})
