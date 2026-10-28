import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { noteFor } from '../lib/notes.js'
import { effectiveRoutine, lastEntryFor, bestWeightFor, buildSets, setsDoneActive, supersetUnits, unitOf, setLabel, modeOf, EFFORT, effortOf, stepEffort, capEffort } from '../lib/history.js'
import { fmtNum, todayISO, exCount, DAYN } from '../lib/format.js'
import { beep, vibrate } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import Media from '../components/Media.jsx'
import { startFlow, exercisePicker, exConfigSheet, exerciseDetailSheet, topWeightSheet, finishWorkout, workoutCompleteSheet, confirmSheet, exerciseNoteSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Check, NumberField } from '../components/ui.jsx'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { glyphOf } from '../lib/glyphs.js'

/* ---------- start chooser (no active workout) ---------- */
function StartChooser() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const todayR = effectiveRoutine(S, todayISO())
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const others = S.routines.filter(r => r !== todayR)
  return <div className="narrow">
    <div className="hdr"><div><h1>{t('Start workout')}</h1><div className="sub">{t(DAYN[new Date().getDay()])} — {todayR ? t('today is {0}', todayR.name) : t('rest day, but no one’s stopping you')}</div></div></div>
    {todayR && <div className="card" style={{ borderColor: 'var(--acc)' }}>
      <h2 className="accent">{t("Today's plan")}{todayOvr ? ' · ' + t('rescheduled') : ''}</h2>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div><div className="big">{todayR.name}</div><div className="muted small">{exCount(todayR.ex.length)}</div></div>
        <span className="lrow-i" style={{ width: 38, height: 38, borderRadius: 9, fontSize: 22 }}><Icon name={glyphOf(todayR.emoji)} /></span>
      </div>
      <Button variant="primary" icon="play" onClick={() => startFlow(todayR.id)}>{t('Start {0}', todayR.name)}</Button>
    </div>}
    {others.length > 0 && <><h4 className="sec">{t('Other routines')}</h4>
      <div className="list">{others.map(r => <div key={r.id} className="item" onClick={() => startFlow(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <span className="tag acc">{t('Start')}</span></div>)}</div></>}
    <div style={{ height: 14 }} />
    <Button icon="shuffle" onClick={() => startFlow(null)}>{t('Freestyle workout (pick as you go)')}</Button>
    {!S.routines.length && <><div style={{ height: 10 }} /><Button variant="primary" onClick={() => nav('/plan')}>{t('Build a plan first')}</Button></>}
  </div>
}

/* ---------- elapsed clock (isolated so the workout tree doesn't re-render every second) ---------- */
function Elapsed({ start }) {
  const [t, setT] = useState('0:00')
  useEffect(() => {
    const tick = () => { const s = Math.floor((Date.now() - start) / 1000); setT(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')) }
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [start])
  return <span>{t}</span>
}

/* ---------- focus mode: one set at a time ----------
   The workout is a single question — "what do I lift now?" — so the screen shows exactly one
   set: two big steppers, the button that logs it, and nothing competing with them. Everything
   else (other exercises, adding one, finishing, discarding) sits behind the "Exercises" sheet;
   the full set list sits below the fold for anyone who wants to edit a past set. */

const clock = sec => Math.floor(sec / 60) + ':' + String(Math.max(0, sec) % 60).padStart(2, '0')
const cap = n => (n ? n.charAt(0).toUpperCase() + n.slice(1) : n)

// Columns per mode: reps = weight × reps · time = a held duration (+ optional load) ·
// cardio = duration + speed. The first two become the big steppers.
function columns(mode, unit) {
  if (mode === 'cardio') return [{ f: 'min', step: 1, dec: false, u: t('min') }, { f: 'speed', step: 0.5, dec: true, u: 'km/h' }]
  if (mode === 'time') return [{ f: 'sec', step: 5, dec: false, u: t('Seconds') }, { f: 'w', step: 2.5, dec: true, u: unit }]
  return [{ f: 'w', step: 2.5, dec: true, u: unit }, { f: 'r', step: 1, dec: false, u: t('Reps') }]
}

function BigStepper({ col, value, onStep, onType, small }) {
  return <div className={'bigstp' + (small ? ' small' : '')}>
    <button aria-label={t('Decrease')} onClick={() => onStep(-1)}><Icon name="minus" /></button>
    <label className="bigstp-v">
      <NumberField decimal={col.dec} nullable={col.opt} value={value ?? ''} onChange={onType} aria-label={col.u} />
      <span>{col.u}</span>
    </label>
    <button aria-label={t('Increase')} onClick={() => onStep(1)}><Icon name="plus" /></button>
  </div>
}

// Three words instead of a number: how many reps were left in the tank, on whichever scale
// the profile logs (RIR 4/2/0 ≈ RPE 6/8/10). It feeds the same field the stepper writes.
const QUICK_EFFORT = [['Easy', 4, 6], ['Just right', 2, 8], ['At the limit', 0, 10]]

function RestOverlay({ timer, last, next, onEffort }) {
  const S = useStore(s => s.S)
  const { addRest, stopRest } = useUI()
  const A = S.active
  const kind = effortOf(S) === 'rpe' ? 'rpe' : 'rir'
  const set = last && A.entries[last.e]?.sets[last.s]
  // Hidden only for a profile that switched effort logging off on purpose (S.effort 'none');
  // one that never chose gets the three words, saved on the RIR scale.
  const showEffort = S.effort !== 'none' && set && set.done && modeOf({ ...(A.entries[last.e].target || {}), id: A.entries[last.e].id }) === 'reps'
  const R = 134, C = 2 * Math.PI * R
  const frac = timer.total ? timer.left / timer.total : 0
  return <div className="rest-ov" role="dialog" aria-label={t('Rest')}>
    <div className="rest-top"><b>{t('Rest')}</b><span><Elapsed start={A.start} /></span></div>
    <div className="rest-ring">
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r={R} className="trk" />
        <circle cx="150" cy="150" r={R} className="val" strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 150 150)" />
      </svg>
      <div className="rest-c"><span className="rest-t">{clock(timer.left)}</span><span className="rest-of">{t('of {0}', clock(timer.total))}</span></div>
    </div>
    <div className="rest-acts">
      <button onClick={() => addRest(-15)}>−15 s</button>
      <button onClick={() => addRest(15)}>+15 s</button>
      <button className="go" onClick={stopRest}>{t('Skip')}</button>
    </div>
    {showEffort && <div className="rest-eff">
      <div className="rest-q">{t('How did set {0} go?', last.s + 1)}</div>
      <div className="rest-eff-b">{QUICK_EFFORT.map(([label, rir, rpe]) => {
        const v = kind === 'rpe' ? rpe : rir
        return <button key={label} aria-pressed={set[kind] === v} className={set[kind] === v ? 'on' : ''}
          onClick={() => onEffort(last.e, last.s, kind, set[kind] === v ? null : v)}>{t(label)}</button>
      })}</div>
      <div className="rest-hint">{t('Helps decide when to add weight. Optional.')}</div>
    </div>}
    {next && <div className="rest-next"><span>{t('Up next')}</span><b>{next}</b></div>}
  </div>
}

function ExercisesSheet({ close, onJump, onAdd, onDiscard }) {
  const A = useStore(s => s.S.active)
  if (!A) return null
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  const done = A.entries.filter(e => e.sets.length && e.sets.every(s => s.done)).length
  return <>
    <h3>{t('Exercises')}</h3>
    <div className="exlist">
      {units.map((u, k) => u.map((idx, j) => {
        const e = A.entries[idx], n = e.sets.filter(s => s.done).length
        const isCur = u.includes(cur)
        return <button key={idx} className={'exlist-r' + (isCur ? ' on' : '')} onClick={() => { onJump(idx); close() }}>
          <span className="exlist-n">{u.length > 1 ? (k + 1) + String.fromCharCode(97 + j) : k + 1}</span>
          <span className="exlist-m"><span className="exlist-t">{cap(exOr(e.id).n)}</span>
            <span className="exlist-s">{t('{0} of {1} sets', n, e.sets.length)}{u.length > 1 ? ' · ' + t('Superset') : ''}</span></span>
          {n === e.sets.length && n > 0 ? <Icon name="checkCircle" className="exlist-ok" /> : <Icon name="chevronRight" className="chev" />}
        </button>
      }))}
    </div>
    <div style={{ height: 12 }} />
    <Button icon="plus" onClick={() => { close(); onAdd() }}>{t('Add exercise')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="primary" onClick={() => { close(); finishWorkout() }}>
      {done === A.entries.length && done > 0 ? t('Finish workout') : t('Finish workout early · {0} exercises', done + '/' + A.entries.length)}
    </Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="danger" onClick={() => { close(); onDiscard() }}>{t('Discard workout')}</Button>
  </>
}

/* ---------- active workout ---------- */
function ActiveWorkout() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const { startRest, stopRest, finishWorkEarly, stopWork } = useUI()
  const timer = useUI(s => s.timer)
  const working = useUI(s => s.work)
  const [pickE, setPickE] = useState(null)   // entry chosen by hand inside a superset
  const [pickS, setPickS] = useState(null)   // { e, s } — a set chosen by hand
  const [last, setLast] = useState(null)     // { e, s } — the set just logged (rest overlay rates it)
  const A = S.active
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  const unit = A.entries.length ? unitOf(units, cur) : []
  const unitIdx = units.findIndex(u => u === unit)
  const isSuperset = unit.length > 1
  const isLastUnit = unitIdx >= units.length - 1

  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  const done = setsDoneActive(A)

  // Which exercise of the unit is up: in a superset, the one with the fewest sets logged, so
  // the rounds alternate A1, A2, A1, A2 without anyone having to switch by hand.
  const doneOf = idx => A.entries[idx].sets.filter(s => s.done).length
  const open = unit.filter(i => A.entries[i].sets.some(s => !s.done))
  const autoE = open.length ? open.reduce((b, i) => (doneOf(i) < doneOf(b) ? i : b), open[0]) : unit[0]
  const eIdx = pickE != null && unit.includes(pickE) ? pickE : autoE
  const entry = eIdx != null ? A.entries[eIdx] : null

  const mutEntry = (idx, fn) => update(s => { fn(s.active.entries[idx]) }, true)
  // Clearing an optional field drops the key rather than storing null, so a set only carries
  // what was actually logged — in the session, in history and in a backup.
  const setField = (idx, i, field, v) => mutEntry(idx, e => {
    if (v == null) delete e.sets[i][field]; else e.sets[i][field] = v
  })
  const modeAt = idx => modeOf({ ...(A.entries[idx].target || {}), id: A.entries[idx].id })
  const addSet = idx => mutEntry(idx, e => {
    const l = e.sets[e.sets.length - 1]
    const tg = e.target || {}
    const m = modeOf({ ...tg, id: e.id })
    if (m === 'cardio') e.sets.push({ min: l ? l.min : (tg.min || 20), speed: l ? l.speed : (tg.speed || 8), done: false })
    else if (m === 'time') e.sets.push({ sec: l ? l.sec : (tg.sec || 45), w: l ? (l.w || 0) : (tg.weight || 0), done: false })
    else e.sets.push({ w: l ? l.w : (tg.weight || 0), r: l ? l.r : (tg.reps || 8), done: false })
  })
  const removeSet = idx => mutEntry(idx, e => { if (e.sets.length > 1) e.sets.pop() })
  const goUnit = k => { setPickE(null); setPickS(null); update(s => { s.active.cur = units[k][0] }) }
  const jump = idx => { setPickS(null); setPickE(idx); update(s => { s.active.cur = idx }) }

  // A timed set is held, not typed. The work timer records what was actually held — an early
  // finish logs 0:38 of a 0:45 target rather than crediting the full prescription — and then
  // checks the set off through the normal path, so rest, supersets and the finish prompt all
  // behave exactly as they do for a reps set.
  const startTimed = (idx, i) => {
    const e = A.entries[idx]
    useUI.getState().startWork(e.sets[i].sec || 45, exOr(e.id).n, elapsed => {
      mutEntry(idx, en => { en.sets[i].sec = elapsed })
      if (!useStore.getState().S.active.entries[idx].sets[i].done) toggle(idx, i)
    })
  }

  const toggle = (idx, i) => {
    const m = modeAt(idx)
    const cardioEntry = m === 'cardio'
    let askTop = false, exJustDone = false, workoutDone = false, nowDone = false
    mutEntry(idx, e => {
      e.sets[i].done = !e.sets[i].done
      nowDone = e.sets[i].done
      if (e.sets[i].done) {
        beep(S.sound, 1040, 0.12); vibrate(30)
        const isLastExInUnit = idx === unit[unit.length - 1]
        const unitDone = unit.every(ui => (ui === idx ? e : A.entries[ui]).sets.every(x => x.done))
        if (isLastExInUnit && !unitDone) startRest(S.restSec)
        else if (unitDone) stopRest()
        if (unitDone && isLastUnit) workoutDone = true      // last exercise's last set → done
        // Only reps training has a "working weight" worth confirming — a bodyweight plank
        // has nothing to put in that slider.
        if (e.sets.every(x => x.done)) { exJustDone = true; if (m === 'reps' && !e.asked) { e.asked = true; askTop = true } }
      }
    })
    setPickS(null); setPickE(null)
    setLast(nowDone ? { e: idx, s: i } : null)
    // reps: topWeight first (it chains into the finish/continue prompt on the last unit).
    // cardio/timed or already-confirmed: go straight to the prompt.
    if (askTop) topWeightSheet(idx)
    else if (workoutDone) workoutCompleteSheet()
    else if (exJustDone && cardioEntry) useUI.getState().toast(t('Cardio logged'))
    else if (exJustDone && m === 'time') useUI.getState().toast(t('Hold logged'))
  }

  // Live-presence heartbeat so the admin dashboard can show who's training now. Signed-in only —
  // guests have no server session. Reads fresh state each tick so progress stays current.
  useEffect(() => {
    if (!useStore.getState().user) return
    let stopped = false
    const ping = active => {
      const A2 = useStore.getState().S.active
      if (!A2) return
      const u = supersetUnits(A2.entries)
      const c = Math.min(A2.cur, Math.max(0, A2.entries.length - 1))
      const ui = u.findIndex(x => x.includes(c))
      const tot = A2.entries.reduce((n, e) => n + e.sets.length, 0)
      api('/api/activity', { method: 'POST', body: JSON.stringify({
        active, name: A2.name, exIdx: ui + 1, exTotal: u.length,
        setsDone: setsDoneActive(A2), setsTotal: tot, startedAt: A2.start
      }) }).catch(() => {})
    }
    ping(true)
    const iv = setInterval(() => { if (!stopped) ping(true) }, 20000)
    return () => {
      stopped = true; clearInterval(iv)
      // best-effort "left" signal: sendBeacon survives a tab close, fetch covers in-app nav
      try { navigator.sendBeacon?.('/api/activity', new Blob([JSON.stringify({ active: false })], { type: 'application/json' })) } catch { /* */ }
      api('/api/activity', { method: 'POST', body: JSON.stringify({ active: false }) }).catch(() => {})
    }
  }, [])

  const discard = () => confirmSheet({ title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true, onConfirm: () => { update(s => { s.active = null }); stopRest(); nav('/home') } })
  const addExercise = () => exercisePicker(ex => exConfigSheet(ex, null, cfg => update(s => {
    const full = { ...cfg, id: ex.id }
    const plan = nextPrescription(s, full, s.routines.find(r => r.id === s.active.routineId))
    s.active.entries.push({ id: ex.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(s, full), plan) })
    s.active.cur = s.active.entries.length - 1
  }), null, S.routines.find(r => r.id === A.routineId)))
  const openList = () => useUI.getState().openSheet(close => <ExercisesSheet close={close} onJump={jump} onAdd={addExercise} onDiscard={discard} />)

  const top = <div className="fx-top">
    <button className="fx-ib" aria-label={t('Pause')} onClick={() => nav('/home')}><Icon name="pause" /></button>
    <div className="fx-clock"><Elapsed start={A.start} /><span>{done}/{total}</span></div>
    <button className="fx-pill" onClick={openList}>{t('Exercises')}</button>
  </div>

  if (!entry) return <div className="focus">
    {top}
    <div className="empty" style={{ flex: 1 }}><div className="ico"><Icon name="shuffle" /></div>{t('Freestyle workout — add your first exercise.')}</div>
    <button className="fx-go" onClick={addExercise}><Icon name="plus" />{t('Add exercise')}</button>
  </div>

  // An exercise left with no sets at all (only reachable from damaged data) offers one back
  // instead of a screen that has no set to show.
  if (!entry.sets.length) return <div className="focus">
    {top}
    <div className="empty" style={{ flex: 1 }}>{cap(exOr(entry.id).n)}</div>
    <button className="fx-go" onClick={() => addSet(eIdx)}><Icon name="plus" />{t('Add set')}</button>
  </div>

  const ex = exOr(entry.id)
  const mode = modeAt(eIdx)
  const timed = mode === 'time'
  const [c1, c2] = columns(mode, S.unit)
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const c3 = mode === 'reps' && eff ? { ...eff, eff: kind, dec: true, opt: true, u: t(eff.hd) } : null
  const firstOpen = entry.sets.findIndex(s => !s.done)
  const sIdx = pickS && pickS.e === eIdx && pickS.s < entry.sets.length ? pickS.s : (firstOpen < 0 ? entry.sets.length - 1 : firstOpen)
  const set = entry.sets[sIdx]
  const unitDone = unit.every(i => A.entries[i].sets.every(s => s.done))
  const lastTime = lastEntryFor(S, entry.id)
  const note = noteFor(S, entry.id)
  const plan = entry.plan
  // The same number the "confirm your working weight" sheet calls your best, so the two
  // never disagree inside one session: heaviest logged set, or the working weight you kept.
  const best = mode === 'cardio' ? 0 : Math.max(bestWeightFor(S, entry.id), (S.exWeights[entry.id] || {}).w || 0)
  // The effort column walks its own scale — see stepEffort. Weight and reps step up from 0
  // with no ceiling, as they always did.
  const step = (col, dir) => col.eff
    ? setField(eIdx, sIdx, col.f, stepEffort(col.eff, set[col.f], dir))
    : setField(eIdx, sIdx, col.f, Math.max(0, Math.round(((set[col.f] || 0) + dir * col.step) * 100) / 100))
  const type = (col, v) => setField(eIdx, sIdx, col.f, col.eff ? capEffort(col.eff, v) : v)

  // What comes after the set just logged, for the rest screen.
  const nextLine = (() => {
    if (!open.length) return isLastUnit ? null : cap(exOr(A.entries[units[unitIdx + 1][0]].id).n)
    const e2 = A.entries[autoE], i2 = e2.sets.findIndex(s => !s.done)
    const lbl = t('Set {0}', i2 + 1) + ' · ' + setLabel(e2.id, e2.sets[i2], e2.target)
    return autoE === eIdx ? lbl : cap(exOr(e2.id).n) + ' · ' + lbl
  })()

  // A hold in progress takes over the big button: it counts down and logs the time held when
  // tapped, so the one thing on screen is the one thing happening.
  let primary
  if (working) primary = <button className="fx-go sig" onClick={finishWorkEarly}><Icon name="check" />{t('Done')} · {clock(working.left)}</button>
  else if (!set.done) primary = timed
    ? <button className="fx-go" disabled={!!working} onClick={() => startTimed(eIdx, sIdx)}><Icon name="play" />{t('Start set')}</button>
    : <button className="fx-go" onClick={() => toggle(eIdx, sIdx)}><Icon name="check" />{t('Set done')}</button>
  else if (unitDone) primary = isLastUnit
    ? <button className="fx-go sig" onClick={finishWorkout}><Icon name="flag" />{t('Finish workout')}</button>
    : <button className="fx-go" onClick={() => goUnit(unitIdx + 1)}>{t('Next exercise')}<Icon name="chevronRight" /></button>

  return <div className="focus">
    {top}
    <div className="wprog"><i style={{ width: (total ? done / total * 100 : 0) + '%' }} /></div>

    <div className="fx-head">
      <div className="fx-k">
        <button aria-label={t('Prev')} disabled={unitIdx <= 0} onClick={() => goUnit(unitIdx - 1)}><Icon name="chevronLeft" /></button>
        <span>{t('{0} of {1}', unitIdx + 1, units.length)}{(ex.tg || ex.bp) ? ' · ' + t(ex.tg || ex.bp) : ''}</span>
        <button aria-label={t('Next')} disabled={isLastUnit} onClick={() => goUnit(unitIdx + 1)}><Icon name="chevronRight" /></button>
      </div>
      <div className="fx-name">
        <h1>{cap(ex.n)}</h1>
        <button className="fx-ib" aria-label={t('Details')} onClick={() => exerciseDetailSheet(ex)}><Icon name="info" /></button>
      </div>
      {isSuperset && <div className="fx-ss" role="tablist" aria-label={t('Superset')}>
        <Icon name="link" />
        {unit.map((i, j) => <button key={i} role="tab" aria-selected={i === eIdx} className={i === eIdx ? 'on' : ''}
          onClick={() => { setPickS(null); setPickE(i) }}>{String.fromCharCode(65 + j)} · {cap(exOr(A.entries[i].id).n)}</button>)}
      </div>}
    </div>

    <Media ex={ex} key={entry.id} compact minimizable />

    <div className="fx-dots" aria-label={t('Set {0} of {1}', sIdx + 1, entry.sets.length)}>
      {entry.sets.map((s, i) => <button key={i} aria-label={t('Set {0}', i + 1)}
        className={(s.done ? 'done' : '') + (i === sIdx ? ' cur' : '')} onClick={() => setPickS({ e: eIdx, s: i })} />)}
      <span>{t('Set {0} of {1}', sIdx + 1, entry.sets.length)}</span>
    </div>

    <div className="fx-steps">
      <BigStepper col={c1} value={set[c1.f]} onStep={d => step(c1, d)} onType={v => type(c1, v)} />
      <BigStepper col={c2} value={set[c2.f]} onStep={d => step(c2, d)} onType={v => type(c2, v)} />
      {c3 && <BigStepper small col={c3} value={set[c3.f]} onStep={d => step(c3, d)} onType={v => type(c3, v)} />}
      <div className="fx-info">
        {best > 0 && <span>{t('Best:')} {fmtNum(best)} {S.unit}</span>}
        {lastTime && <span>{t('Last time')} {lastTime.sets.map(s => setLabel(entry.id, s, lastTime.target)).join(', ')}</span>}
        {plan && plan.why && plan.kind !== 'off' && <span className={'fx-plan' + (plan.kind === 'deload' ? ' warn' : '')}>
          <Icon name={plan.kind === 'up' ? 'arrowUp' : plan.kind === 'deload' ? 'arrowDown' : 'lightbulb'} />{t(...plan.why)}</span>}
      </div>
    </div>

    {/* The note is what you wrote for exactly this moment, so it sits right above the button. */}
    {note
      ? <button className="xnote" onClick={() => exerciseNoteSheet(ex)}><Icon name="pencil" /><span className="xnote-t">{note}</span></button>
      : <button className="addnote" onClick={() => exerciseNoteSheet(ex)}><Icon name="pencil" />{t('Add note')}</button>}

    <div className="fx-actions">
      {primary}
      {working
        ? <button className="fx-sub" onClick={stopWork}>{t('Cancel')}</button>
        : set.done
          ? <button className="fx-sub" onClick={() => toggle(eIdx, sIdx)}>{t('Undo set')}</button>
          : timed && <button className="fx-sub" onClick={() => toggle(eIdx, sIdx)}>{t('Mark as done')}</button>}
    </div>

    <h4 className="sec">{t('All sets')}</h4>
    <div className="fx-sets">
      {entry.sets.map((s, i) => <div key={i} className={'fx-set' + (i === sIdx ? ' cur' : '') + (s.done ? ' done' : '')}>
        <button className="fx-set-m" onClick={() => setPickS({ e: eIdx, s: i })}>
          <span className="fx-set-n">{i + 1}</span><span>{setLabel(entry.id, s, entry.target)}</span>
        </button>
        <Check checked={s.done} onChange={() => toggle(eIdx, i)} />
      </div>)}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <Button size="sm" icon="minus" disabled={entry.sets.length <= 1} onClick={() => removeSet(eIdx)}>{t('Remove set')}</Button>
        <Button size="sm" icon="plus" onClick={() => addSet(eIdx)}>{t('Add set')}</Button>
      </div>
    </div>
    <div style={{ height: 24 }} />

    {timer && <RestOverlay timer={timer} last={last} next={nextLine} onEffort={(e, i, k, v) => setField(e, i, k, v)} />}
  </div>
}

export default function Workout() {
  const active = useStore(s => s.S.active)
  return active ? <ActiveWorkout /> : <StartChooser />
}
