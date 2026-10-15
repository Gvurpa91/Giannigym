// Rule-based program builder — no AI, no server, no account.
//
// Turns the intake answers (goal, experience, days, session length, equipment, exercises to
// avoid) into a complete weekly plan in the app's own share format (`opengym_plan: 1`), so
// applying it is exactly the same code path as importing a plan file: parsePlan → mergePlan.
//
// Everything here is deterministic and pure: same answers, same plan. The reasoning is
// written out per exercise (`why`) in plain language, and every pick carries ranked
// alternatives (`alt`) so the person can swap without losing the structure.
//
// The programming rules are deliberately conventional — split by available days, compounds
// first, a per-set time budget that respects the session length, rep ranges by goal,
// progression policies the engine already implements. The engine, not this file, decides the
// loads from session to session.

import { EXIDX } from './exercises.js'
import { modeOf } from './history.js'
import { t } from './i18n.js'

export const GOALS = ['strength', 'muscle', 'fatloss', 'general', 'endurance']
export const EXPERIENCE = ['new', 'returning', 'regular']
const EXP_INDEX = { new: 0, returning: 1, regular: 2 }

/* ------------------------------ movement patterns ------------------------------
   Candidates are ranked: the first available one is picked. `min` is the experience floor
   (0 new · 1 returning · 2 regular) below which a candidate is skipped automatically — a
   beginner gets a goblet squat and a lat pulldown, not a front squat and a pull-up. Skipped
   candidates still appear as alternatives, so nothing is hidden. `mode` overrides the logging
   mode where the exercise is a hold rather than reps. */
const C = (id, min = 0, mode) => ({ id, min, ...(mode ? { mode } : {}) })
export const SLOTS = {
  squat:   { label: 'Squat pattern',     c: [C('0043', 1), C('0042', 2), C('0770', 1), C('1760'), C('0534'), C('0739'), C('0760'), C('2287'), C('0413'), C('1004'), C('2368'), C('3769'), C('1759', 2), C('1685')] },
  hinge:   { label: 'Hip hinge',         c: [C('0032', 1), C('0811', 1), C('0085', 1), C('1459'), C('0549'), C('0300'), C('1757'), C('0586'), C('0599'), C('0991'), C('0489'), C('3645'), C('3561')] },
  hpush:   { label: 'Horizontal push',   c: [C('0025', 1), C('0289'), C('0748'), C('0577'), C('0047', 1), C('0314'), C('0662'), C('0493'), C('0251', 1)] },
  vpush:   { label: 'Vertical push',     c: [C('0091', 1), C('0426'), C('0405'), C('0603'), C('0766'), C('0553'), C('0997'), C('1296', 1)] },
  hpull:   { label: 'Horizontal pull',   c: [C('0027', 1), C('0293'), C('0292'), C('0861'), C('1350'), C('0499'), C('3165'), C('1773')] },
  vpull:   { label: 'Vertical pull',     c: [C('0652', 1), C('1326', 1), C('2330'), C('0579'), C('0017'), C('0970'), C('0238')] },
  single:  { label: 'Single-leg work',   c: [C('0336'), C('0054', 1), C('0431'), C('1460'), C('3470'), C('2368'), C('1757')] },
  core:    { label: 'Core',              c: [C('0276'), C('0175'), C('0472', 1), C('0687'), C('0274'), C('3239'), C('2135', 1, 'time')] },
  delts:   { label: 'Shoulders',         c: [C('0334'), C('0178'), C('2292'), C('0380')] },
  biceps:  { label: 'Biceps',            c: [C('0294'), C('0031'), C('0447'), C('0313')] },
  triceps: { label: 'Triceps',           c: [C('0241'), C('0430'), C('0129'), C('0814', 1), C('0194')] },
  calves:  { label: 'Calves',            c: [C('0605'), C('0594'), C('1379'), C('0738')] },
  cardio:  { label: 'Conditioning',      c: [C('2138'), C('0685'), C('3666'), C('2612'), C('0630'), C('1160', 1)] }
}

/* ------------------------------ day templates ------------------------------
   Roles: main (heaviest compound, never dropped) · second (compound) · acc (accessory).
   A slot may repeat inside a day; the second pick takes the next available candidate. */
const DAYS = {
  fullA:  { name: 'Full body A', emoji: 'figureStrength', slots: [['squat', 'main'], ['hpush', 'main'], ['hpull', 'second'], ['hinge', 'second'], ['delts', 'acc'], ['core', 'acc'], ['biceps', 'acc']] },
  fullB:  { name: 'Full body B', emoji: 'barbell',        slots: [['hinge', 'main'], ['vpush', 'main'], ['vpull', 'second'], ['single', 'second'], ['triceps', 'acc'], ['core', 'acc'], ['calves', 'acc']] },
  fullC:  { name: 'Full body C', emoji: 'dumbbell',       slots: [['squat', 'main'], ['hpull', 'main'], ['hpush', 'second'], ['hinge', 'second'], ['vpull', 'acc'], ['core', 'acc'], ['delts', 'acc']] },
  upperA: { name: 'Upper A',     emoji: 'arm',            slots: [['hpush', 'main'], ['hpull', 'main'], ['vpush', 'second'], ['vpull', 'second'], ['biceps', 'acc'], ['triceps', 'acc'], ['delts', 'acc']] },
  lowerA: { name: 'Lower A',     emoji: 'legs',           slots: [['squat', 'main'], ['hinge', 'second'], ['single', 'second'], ['calves', 'acc'], ['core', 'acc']] },
  upperB: { name: 'Upper B',     emoji: 'pullup',         slots: [['vpull', 'main'], ['vpush', 'main'], ['hpull', 'second'], ['hpush', 'second'], ['delts', 'acc'], ['biceps', 'acc'], ['triceps', 'acc']] },
  lowerB: { name: 'Lower B',     emoji: 'kettlebell',     slots: [['hinge', 'main'], ['squat', 'second'], ['single', 'second'], ['core', 'acc'], ['calves', 'acc']] },
  push:   { name: 'Push',        emoji: 'figureStrength', slots: [['hpush', 'main'], ['vpush', 'second'], ['hpush', 'acc'], ['delts', 'acc'], ['triceps', 'acc'], ['triceps', 'acc']] },
  pull:   { name: 'Pull',        emoji: 'pullup',         slots: [['vpull', 'main'], ['hpull', 'main'], ['hpull', 'acc'], ['delts', 'acc'], ['biceps', 'acc'], ['biceps', 'acc']] },
  legs:   { name: 'Legs',        emoji: 'legs',           slots: [['squat', 'main'], ['hinge', 'second'], ['single', 'second'], ['calves', 'acc'], ['core', 'acc']] },
  pushB:  { name: 'Push B',      emoji: 'dumbbell',       slots: [['vpush', 'main'], ['hpush', 'second'], ['hpush', 'acc'], ['delts', 'acc'], ['triceps', 'acc']] },
  pullB:  { name: 'Pull B',      emoji: 'barbell',        slots: [['hpull', 'main'], ['vpull', 'main'], ['vpull', 'acc'], ['delts', 'acc'], ['biceps', 'acc']] },
  legsB:  { name: 'Legs B',      emoji: 'kettlebell',     slots: [['hinge', 'main'], ['squat', 'second'], ['single', 'second'], ['core', 'acc'], ['calves', 'acc']] }
}
const SPLITS = {
  1: ['fullA'],
  2: ['fullA', 'fullB'],
  3: ['fullA', 'fullB', 'fullC'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['upperA', 'lowerA', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'pushB', 'pullB', 'legsB'],
  7: ['push', 'pull', 'legs', 'pushB', 'pullB', 'legsB', 'fullA']
}
export const SPLIT_NAME = {
  1: 'Full body', 2: 'Full body A / B', 3: 'Full body A / B / C', 4: 'Upper / Lower',
  5: 'Upper / Lower + Push / Pull / Legs', 6: 'Push / Pull / Legs ×2', 7: 'Push / Pull / Legs ×2 + Full body'
}
// Mon-first spread when the person did not pick their own days.
const DEFAULT_DAYS = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 0] }

/* ------------------------------ schemes by goal ------------------------------ */
const SCHEME = {
  strength:  { main: { reps: 5, prog: 'linear' }, second: { reps: 6, prog: 'linear' }, acc: { reps: 10, prog: 'double', repsMin: 8 } },
  muscle:    { main: { reps: 6, prog: 'linear' }, second: { reps: 10, prog: 'double', repsMin: 8 }, acc: { reps: 12, prog: 'double', repsMin: 10 } },
  fatloss:   { main: { reps: 8, prog: 'linear' }, second: { reps: 12, prog: 'double', repsMin: 10 }, acc: { reps: 15, prog: 'double', repsMin: 12 }, finisher: 10 },
  general:   { main: { reps: 8, prog: 'linear' }, second: { reps: 10, prog: 'linear' }, acc: { reps: 12, prog: 'double', repsMin: 10 } },
  endurance: { main: { reps: 12, prog: 'double', repsMin: 10 }, second: { reps: 15, prog: 'double', repsMin: 12 }, acc: { reps: 20, prog: 'double', repsMin: 15 }, finisher: 15 }
}
// Minutes one set takes including its rest. The number a 60-minute session is actually
// planned around, which is what makes "fits the hour" more than a promise.
const SET_MIN = { main: 3, second: 2.5, acc: 1.75 }
const SUPERSET_ACC_MIN = 1.25
const WARMUP = m => (m >= 60 ? 8 : 5)
const MAX_EX = { new: 6, returning: 7, regular: 8 }

export const GOAL_SUMMARY = {
  strength: 'Low reps on the main lifts with steady weight increases; accessories keep muscles and joints balanced.',
  muscle: 'Progressive overload across 6–15 reps, enough weekly sets per muscle, and recovery between sessions.',
  fatloss: 'Fat loss comes from an energy deficit; training keeps your muscle and raises what you burn. No exercise targets belly fat specifically — the plan trains the whole body and ends with conditioning.',
  general: 'A balanced mix of pushing, pulling, legs and core, with progression you can keep up.',
  endurance: 'Higher reps, shorter rests and conditioning at the end of each session.'
}

/* ------------------------------ picking ------------------------------ */
const available = (eq, equipment) => !equipment.length || eq === 'body weight' || equipment.includes(eq)

// Ranked candidates for a slot that the person can actually do: present in the library,
// not avoided, equipment available. `strict` also applies the experience floor.
function candidates(slot, ctx, strict) {
  return SLOTS[slot].c.filter(c => {
    const ex = EXIDX[c.id]
    if (!ex || ctx.avoid.has(c.id)) return false
    if (!available(ex.eq, ctx.equipment)) return false
    return !strict || c.min <= ctx.exp
  })
}
// When a pattern has nothing suitable for this person (a beginner with no bar for vertical
// pulls, say), the neighbouring pattern stands in before the experience floor is relaxed.
const FALLBACK = { vpull: 'hpull', hpull: 'vpull', vpush: 'hpush', hpush: 'vpush', single: 'squat', squat: 'single', hinge: 'single' }
function pick(slot, used, ctx) {
  const first = list => list.filter(c => !used.has(c.id))[0] || null
  const strict = first(candidates(slot, ctx, true))
  if (strict) return { ...strict, slot }
  if (FALLBACK[slot]) {
    const alt = first(candidates(FALLBACK[slot], ctx, true))
    if (alt) return { ...alt, slot: FALLBACK[slot] }
  }
  const any = first(candidates(slot, ctx, false))
  return any ? { ...any, slot } : null
}
/** Up to 3 swaps for a chosen exercise, from its own pattern, not already in the routine. */
export function alternativesFor(slot, chosenId, routineIds, ctx) {
  return candidates(slot, ctx, false)
    .filter(c => c.id !== chosenId && !routineIds.includes(c.id))
    .slice(0, 3)
    .map(c => ({ id: c.id, ...(c.mode ? { mode: c.mode } : {}) }))
}

function setsFor(role, ctx) {
  if (role === 'main') return ctx.goal === 'strength' ? (ctx.exp === 0 ? 3 : 5) : ctx.goal === 'muscle' && ctx.exp > 0 ? 4 : 3
  if (role === 'second') return 3
  return ctx.exp === 0 || ctx.sessionMin <= 45 ? 2 : 3
}

function schemeFor(role, slot, cand, ctx) {
  const mode = cand.mode || modeOf({ id: cand.id })
  if (mode === 'cardio') return { mode: 'cardio', sets: 1, min: 10, speed: 8 }
  if (mode === 'time') return { mode: 'time', sets: setsFor(role, ctx), sec: 45, prog: 'time' }
  const s = SCHEME[ctx.goal][role]
  const out = { mode: 'reps', sets: setsFor(role, ctx), reps: s.reps, prog: s.prog }
  if (s.repsMin) out.repsMin = s.repsMin
  // Core work is high-rep regardless of the goal — nobody loads a dead bug for strength.
  if (slot === 'core') { out.reps = 15; out.prog = 'double'; out.repsMin = 12 }
  // Experienced strength lifters get the AMRAP top set on the main lifts; the engine's
  // Greyskull policy then owns the jumps and the 10 % resets.
  if (role === 'main' && ctx.goal === 'strength' && ctx.exp === 2) out.prog = 'greyskull'
  return out
}

/* ------------------------------ reasons ------------------------------ */
function whyFor(role, slot, cfg, superset) {
  const parts = [t(SLOTS[slot].label) + '.']
  if (slot === 'cardio') parts.push(t('Finisher: {0} minutes of easy conditioning to raise what you burn each week.', cfg.min))
  else if (role === 'main') parts.push(t('Main lift: the heaviest compound comes first, while you are fresh.'))
  else if (role === 'second') parts.push(t('Second compound: covers the pattern the main lift leaves out.'))
  else parts.push(t('Accessory: smaller muscles, higher reps, shorter rests.'))
  if (cfg.mode === 'time') parts.push(t('{0} × {1} s — hold every set for the full time and the target grows.', cfg.sets, cfg.sec))
  else if (cfg.prog === 'greyskull') parts.push(t('{0} × {1}+ — last set as many reps as you can; beat the target and the weight goes up.', cfg.sets, cfg.reps))
  else if (cfg.prog === 'double') parts.push(t('{0} × {1}–{2} — work up the rep range at the same weight, then add load.', cfg.sets, cfg.repsMin, cfg.reps))
  else if (cfg.mode === 'reps') parts.push(t('{0} × {1} — add weight every time you hit all the reps.', cfg.sets, cfg.reps))
  if (superset) parts.push(t('Supersetted with the exercise above to save time.'))
  return parts.join(' ')
}

/* ------------------------------ one day ------------------------------ */
function buildDay(key, idx, ctx) {
  const tpl = DAYS[key]
  let budget = ctx.sessionMin - WARMUP(ctx.sessionMin)
  const used = new Set()
  const ex = []
  const maxEx = MAX_EX[EXPERIENCE[ctx.exp]]
  // Supersets: accessories are paired when time is short or density is the point. In that
  // case they are budgeted at the supersetted cost up front, and an accessory left without a
  // partner is re-charged (and dropped if that breaks the budget) once the day is laid out.
  const dense = ctx.goal === 'fatloss' || ctx.goal === 'endurance' || ctx.sessionMin <= 45
  const perSetFor = role => (role === 'acc' && dense ? SUPERSET_ACC_MIN : SET_MIN[role])
  for (const [wanted, role] of tpl.slots) {
    if (ex.length >= maxEx) break
    const cand = pick(wanted, used, ctx)
    if (!cand) continue
    const slot = cand.slot
    const cfg = schemeFor(role, slot, cand, ctx)
    const perSet = perSetFor(role)
    let cost = cfg.sets * perSet
    if (role !== 'main' && cost > budget) {
      // Try the same exercise with fewer sets before dropping it: two sets of a row beat
      // no row at all. Mains are never dropped — the session is built around them.
      if (cfg.sets > 2 && 2 * perSet <= budget) { cfg.sets = 2; cost = 2 * perSet } else continue
    }
    used.add(cand.id)
    budget -= cost
    ex.push({ id: cand.id, slot, role, ...cfg })
  }
  if (dense) {
    for (let i = 0; i < ex.length; i++) {
      const a = ex[i], b = ex[i + 1]
      if (a.role !== 'acc' || a.sg) continue
      if (b && b.role === 'acc' && !b.sg) {
        const sg = 'ss' + idx + i
        a.sg = sg; b.sg = sg
        i++
        continue
      }
      // No partner: this one is done as straight sets after all.
      const extra = a.sets * (SET_MIN.acc - SUPERSET_ACC_MIN)
      if (extra <= budget) budget -= extra
      else { used.delete(a.id); ex.splice(i, 1); i-- }
    }
  }
  // Conditioning finisher when the goal asks for one and the time is actually there.
  const fin = SCHEME[ctx.goal].finisher
  if (fin && budget >= 6) {
    const cand = pick('cardio', used, ctx)
    if (cand && cand.slot === 'cardio') {
      const min = Math.min(fin, Math.floor(budget) - 1)
      ex.push({ id: cand.id, slot: 'cardio', role: 'acc', mode: 'cardio', sets: 1, min, speed: 8 })
      budget -= min
    }
  }
  const ids = ex.map(e => e.id)
  const routine = {
    id: 'r' + (idx + 1),
    name: t(tpl.name),
    emoji: tpl.emoji,
    prog: 'linear',
    ex: ex.map(e => {
      const { slot, role, ...cfg } = e
      const superset = !!cfg.sg
      return { ...cfg, slot, role, why: whyFor(role, slot, cfg, superset), alt: alternativesFor(slot, cfg.id, ids, ctx) }
    })
  }
  routine.minutes = estimateMinutes(routine, ctx.sessionMin)
  routine.why = t('{0} exercises, about {1} minutes including warm-up.', routine.ex.length, routine.minutes)
  return routine
}

/** Planned duration of a routine, with the same per-set costs the builder budgets with. */
export function estimateMinutes(routine, sessionMin) {
  let m = WARMUP(sessionMin || 60)
  const ex = routine.ex || []
  ex.forEach((e, i) => {
    if (e.mode === 'cardio' || modeOf(e) === 'cardio') { m += e.min || 10; return }
    const paired = e.sg && (ex[i - 1]?.sg === e.sg || ex[i + 1]?.sg === e.sg)
    const role = e.role || (i < 2 ? 'main' : i < 4 ? 'second' : 'acc')
    m += (e.sets || 1) * (paired ? SUPERSET_ACC_MIN : (SET_MIN[role] || SET_MIN.acc))
  })
  return Math.round(m)
}

/* ------------------------------ the plan ------------------------------ */
/**
 * Build a plan from intake answers.
 * profile: { goal, experience, daysPerWeek, preferredDays?, sessionMin, equipment?, avoid? }
 * Returns a bundle in the share format plus `summary`, `basedOn`, per-exercise `why` and `alt`.
 */
export function buildProgram(profile) {
  const days = Math.max(1, Math.min(7, +profile.daysPerWeek || 3))
  const ctx = {
    goal: GOALS.includes(profile.goal) ? profile.goal : 'general',
    exp: EXP_INDEX[profile.experience] ?? 1,
    sessionMin: Math.max(20, Math.min(180, +profile.sessionMin || 60)),
    equipment: (profile.equipment || []).map(e => String(e).toLowerCase()),
    avoid: new Set(profile.avoid || [])
  }
  const routines = SPLITS[days].map((key, i) => buildDay(key, i, ctx))
  const pref = (profile.preferredDays || []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
  const order = [1, 2, 3, 4, 5, 6, 0]
  const chosenDays = (pref.length === days ? pref : DEFAULT_DAYS[days]).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const week = {}
  chosenDays.forEach((d, i) => { week[d] = routines[i].id })
  const eqText = ctx.equipment.length ? ctx.equipment.map(e => t(e)).join(', ') : t('full gym')
  return {
    opengym_plan: 1,
    name: t(SPLIT_NAME[days]),
    summary: t(GOAL_SUMMARY[ctx.goal]),
    basedOn: t('Your answers: {0} days a week, {1} minutes per session, {2}.', days, ctx.sessionMin, eqText),
    week, routines, customEx: []
  }
}

/** Replace one exercise with an alternative, keeping its sets/reps scheme and recomputing its alternatives and reason. */
export function swapExercise(bundle, routineId, index, altId, profile) {
  const r = bundle.routines.find(x => x.id === routineId)
  if (!r || !r.ex[index] || !EXIDX[altId]) return bundle
  const e = r.ex[index]
  const ctx = { equipment: (profile?.equipment || []).map(x => String(x).toLowerCase()), avoid: new Set(profile?.avoid || []), exp: EXP_INDEX[profile?.experience] ?? 1 }
  const cand = SLOTS[e.slot]?.c.find(c => c.id === altId) || { id: altId }
  const mode = cand.mode || modeOf({ id: altId })
  let cfg
  if (mode === 'cardio') cfg = { mode: 'cardio', sets: 1, min: e.min || 10, speed: 8 }
  else if (mode === 'time') cfg = { mode: 'time', sets: e.sets, sec: 45, prog: 'time' }
  else if (e.mode === 'reps') cfg = { mode: 'reps', sets: e.sets, reps: e.reps, prog: e.prog, ...(e.repsMin ? { repsMin: e.repsMin } : {}) }
  else cfg = { mode: 'reps', sets: e.sets, reps: 12, prog: 'double', repsMin: 10 }
  const role = e.role || 'acc'
  const next = { ...cfg, id: altId, slot: e.slot, role, ...(e.sg ? { sg: e.sg } : {}) }
  next.why = whyFor(role, e.slot, next, !!e.sg)
  const ids = r.ex.map((x, i) => (i === index ? altId : x.id))
  next.alt = alternativesFor(e.slot, altId, ids, ctx)
  const routines = bundle.routines.map(x => x === r ? { ...r, ex: r.ex.map((x2, i) => (i === index ? next : x2)) } : x)
  return { ...bundle, routines }
}

/** Drop an exercise from a routine (its superset partner is unlinked). */
export function removeExercise(bundle, routineId, index) {
  const routines = bundle.routines.map(r => {
    if (r.id !== routineId) return r
    const ex = r.ex.filter((_, i) => i !== index).map(e => ({ ...e }))
    ex.forEach((e, i) => { if (e.sg && !(ex[i - 1]?.sg === e.sg || ex[i + 1]?.sg === e.sg)) delete e.sg })
    return { ...r, ex }
  })
  return { ...bundle, routines }
}

/** The bundle as parsePlan expects it: builder-only fields stripped from exercises. */
export function toPlanFile(bundle) {
  return {
    opengym_plan: 1,
    name: bundle.name,
    summary: bundle.summary,
    week: { ...bundle.week },
    customEx: [],
    routines: bundle.routines.map(r => ({
      id: r.id, name: r.name, emoji: r.emoji, prog: r.prog, why: r.why,
      ex: r.ex.map(e => {
        const { alt: _alt, slot: _slot, role: _role, ...keep } = e
        return keep
      })
    }))
  }
}
