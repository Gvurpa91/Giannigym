import { describe, it, expect } from 'vitest'
import {
  buildProgram, swapExercise, removeExercise, toPlanFile, estimateMinutes, alternativesFor,
  SLOTS, GOALS
} from './program-builder.js'
import { EXIDX } from './exercises.js'
import { parsePlan, mergePlan } from './plan-share.js'
import { modeOf } from './history.js'

const base = { goal: 'muscle', experience: 'returning', daysPerWeek: 2, sessionMin: 60, equipment: [], avoid: [] }
const ids = r => r.ex.map(e => e.id)
const slots = r => r.ex.map(e => e.slot)

describe('the catalogue', () => {
  it('only names exercises that exist in the library', () => {
    Object.values(SLOTS).forEach(s => s.c.forEach(c => expect(EXIDX[c.id], c.id).toBeTruthy()))
  })
  it('keeps cardio candidates in the cardio slot and nowhere else', () => {
    Object.entries(SLOTS).forEach(([k, s]) => s.c.forEach(c => {
      expect(modeOf({ id: c.id }) === 'cardio', `${k}/${c.id}`).toBe(k === 'cardio')
    }))
  })
})

describe('2 days · 60 min · full gym · full body', () => {
  const b = buildProgram(base)
  it('produces two full-body routines scheduled on two days', () => {
    expect(b.routines).toHaveLength(2)
    expect(Object.keys(b.week)).toHaveLength(2)
    expect(new Set(Object.values(b.week))).toEqual(new Set(['r1', 'r2']))
  })
  it('covers the fundamental patterns across the week', () => {
    const all = b.routines.flatMap(slots)
    ;['squat', 'hinge', 'hpush', 'hpull', 'vpush', 'vpull', 'core'].forEach(p => expect(all, p).toContain(p))
  })
  it('fits the hour, warm-up included, with a realistic exercise count', () => {
    b.routines.forEach(r => {
      expect(r.minutes).toBeLessThanOrEqual(60)
      expect(r.minutes).toBeGreaterThanOrEqual(40)
      expect(r.ex.length).toBeGreaterThanOrEqual(5)
      expect(r.ex.length).toBeLessThanOrEqual(7)
    })
  })
  it('puts the main compounds first and explains every pick', () => {
    b.routines.forEach(r => {
      expect(r.ex[0].role).toBe('main')
      r.ex.forEach(e => { expect(e.why.length).toBeGreaterThan(20); expect(EXIDX[e.id]).toBeTruthy() })
    })
  })
  it('never repeats an exercise inside a routine', () => {
    b.routines.forEach(r => expect(new Set(ids(r)).size).toBe(r.ex.length))
  })
  it('is deterministic', () => {
    expect(JSON.stringify(buildProgram(base))).toBe(JSON.stringify(b))
  })
  it('round-trips through the plan file format and merges into a state', () => {
    const parsed = parsePlan(toPlanFile(b))
    expect(parsed.dropped).toBe(0)
    expect(parsed.routineCount).toBe(2)
    const s = { routines: [], week: {}, customEx: [] }
    mergePlan(s, parsed, { schedule: true })
    expect(s.routines).toHaveLength(2)
    expect(Object.keys(s.week)).toHaveLength(2)
    s.routines.forEach(r => r.ex.forEach(e => { expect(e.alt).toBeUndefined(); expect(e.slot).toBeUndefined() }))
  })
})

describe('equipment', () => {
  it('dumbbells only: every pick is dumbbell or body weight', () => {
    const b = buildProgram({ ...base, equipment: ['dumbbell'] })
    b.routines.flatMap(r => r.ex).forEach(e => expect(['dumbbell', 'body weight']).toContain(EXIDX[e.id].eq))
  })
  it('body weight only still builds a full plan', () => {
    const b = buildProgram({ ...base, equipment: ['body weight'] })
    expect(b.routines.every(r => r.ex.length >= 4)).toBe(true)
    b.routines.flatMap(r => r.ex).forEach(e => expect(EXIDX[e.id].eq).toBe('body weight'))
  })
  it('alternatives respect equipment and never include the chosen exercise', () => {
    const b = buildProgram({ ...base, equipment: ['dumbbell', 'cable'] })
    b.routines.forEach(r => r.ex.forEach(e => {
      e.alt.forEach(a => {
        expect(a.id).not.toBe(e.id)
        expect(ids(r)).not.toContain(a.id)
        expect(['dumbbell', 'cable', 'body weight']).toContain(EXIDX[a.id].eq)
      })
    }))
  })
})

describe('experience', () => {
  it('a beginner is not handed pull-ups or front squats, and gets at most six exercises', () => {
    const b = buildProgram({ ...base, experience: 'new', daysPerWeek: 3 })
    const all = b.routines.flatMap(ids)
    expect(all).not.toContain('0652')   // pull-up
    expect(all).not.toContain('0042')   // front squat
    b.routines.forEach(r => expect(r.ex.length).toBeLessThanOrEqual(6))
  })
  it('an experienced strength lifter gets Greyskull on the main lifts', () => {
    const b = buildProgram({ ...base, goal: 'strength', experience: 'regular' })
    expect(b.routines[0].ex[0].prog).toBe('greyskull')
    expect(b.routines[0].ex[0].reps).toBe(5)
  })
})

describe('goals and time', () => {
  it('fat loss ends sessions with a conditioning finisher when there is time', () => {
    const b = buildProgram({ ...base, goal: 'fatloss', sessionMin: 60 })
    b.routines.forEach(r => expect(r.ex[r.ex.length - 1].mode).toBe('cardio'))
  })
  it('a 30-minute session has fewer exercises than a 90-minute one and still fits', () => {
    const short = buildProgram({ ...base, sessionMin: 30 })
    const long = buildProgram({ ...base, sessionMin: 90 })
    expect(short.routines[0].ex.length).toBeLessThan(long.routines[0].ex.length)
    short.routines.forEach(r => expect(r.minutes).toBeLessThanOrEqual(30 + 3))
  })
  it('supersets accessories when density is the point, and pairs are always adjacent', () => {
    const b = buildProgram({ ...base, goal: 'fatloss', sessionMin: 60 })
    expect(b.routines.some(r => r.ex.some(e => e.sg))).toBe(true)
    b.routines.forEach(r => r.ex.forEach((e, i) => {
      if (e.sg) expect(r.ex[i - 1]?.sg === e.sg || r.ex[i + 1]?.sg === e.sg).toBe(true)
    }))
  })
  it('a short session still fits once unpaired accessories are re-charged', () => {
    const b = buildProgram({ ...base, sessionMin: 45 })
    b.routines.forEach(r => expect(r.minutes).toBeLessThanOrEqual(45 + 2))
  })
  GOALS.forEach(goal => it(`builds a valid plan for goal "${goal}"`, () => {
    const b = buildProgram({ ...base, goal })
    expect(parsePlan(toPlanFile(b)).dropped).toBe(0)
    expect(b.summary.length).toBeGreaterThan(20)
  }))
})

describe('schedule', () => {
  it('uses the preferred days when they match the day count', () => {
    const b = buildProgram({ ...base, daysPerWeek: 2, preferredDays: [2, 6] })
    expect(Object.keys(b.week).map(Number).sort()).toEqual([2, 6])
  })
  it('falls back to a sensible spread otherwise', () => {
    const b = buildProgram({ ...base, daysPerWeek: 3, preferredDays: [1] })
    expect(Object.keys(b.week).map(Number).sort()).toEqual([1, 3, 5])
  })
  ;[1, 2, 3, 4, 5, 6].forEach(d => it(`${d} days → ${d} routines on ${d} days`, () => {
    const b = buildProgram({ ...base, daysPerWeek: d })
    expect(b.routines).toHaveLength(d)
    expect(Object.keys(b.week)).toHaveLength(d)
  }))
})

describe('avoid list and editing', () => {
  it('never picks an avoided exercise, in picks or alternatives', () => {
    const b = buildProgram({ ...base, avoid: ['0025', '0289', '0043'] })
    b.routines.forEach(r => r.ex.forEach(e => {
      expect(['0025', '0289', '0043']).not.toContain(e.id)
      e.alt.forEach(a => expect(['0025', '0289', '0043']).not.toContain(a.id))
    }))
  })
  it('swapping keeps the scheme and recomputes alternatives', () => {
    const b = buildProgram(base)
    const e = b.routines[0].ex[0]
    const alt = e.alt[0].id
    const b2 = swapExercise(b, 'r1', 0, alt, base)
    const n = b2.routines[0].ex[0]
    expect(n.id).toBe(alt)
    expect(n.sets).toBe(e.sets)
    expect(n.reps).toBe(e.reps)
    expect(n.alt.map(a => a.id)).not.toContain(alt)
    expect(n.alt.map(a => a.id)).toContain(e.id)
    expect(b.routines[0].ex[0].id).toBe(e.id)   // original untouched
  })
  it('removing an exercise unlinks a dangling superset', () => {
    const b = buildProgram({ ...base, goal: 'fatloss', sessionMin: 60 })
    const r = b.routines.find(x => x.ex.some(e => e.sg))
    const i = r.ex.findIndex(e => e.sg)
    const b2 = removeExercise(b, r.id, i)
    const r2 = b2.routines.find(x => x.id === r.id)
    expect(r2.ex).toHaveLength(r.ex.length - 1)
    r2.ex.forEach((e, k) => { if (e.sg) expect(r2.ex[k - 1]?.sg === e.sg || r2.ex[k + 1]?.sg === e.sg).toBe(true) })
  })
  it('estimates minutes from the same costs the builder budgets with', () => {
    const b = buildProgram(base)
    b.routines.forEach(r => expect(estimateMinutes(r, 60)).toBe(r.minutes))
  })
  it('alternativesFor excludes everything already in the routine', () => {
    const ctx = { equipment: [], avoid: new Set(), exp: 1 }
    const alts = alternativesFor('squat', '0043', ['0043', '1760'], ctx)
    expect(alts.map(a => a.id)).not.toContain('0043')
    expect(alts.map(a => a.id)).not.toContain('1760')
    expect(alts.length).toBe(3)
  })
})
