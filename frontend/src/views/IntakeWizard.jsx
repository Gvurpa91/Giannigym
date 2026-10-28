import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { DAYN } from '../lib/format.js'
import { EXDB, exOr } from '../lib/exercises.js'
import { exercisePicker } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'
import { Button, TextArea } from '../components/ui.jsx'

/* The intake wizard, shared by the rule-based program builder and the AI Coach: one topic per
   screen, because a single form with eleven fields is a form people abandon. Only the first
   two questions are required — everything after them improves the plan without gating it.

   `mode` decides the last screen: the builder works from a structured list of exercises to
   avoid (ids it can honour mechanically); the Coach reads free text (likes, dislikes, notes). */

export const GOALS = [
  ['strength', 'Get stronger'],
  ['muscle', 'Build muscle'],
  ['fatloss', 'Lose fat'],
  ['general', 'General fitness'],
  ['endurance', 'Endurance']
]
export const EXPERIENCE = [
  ['new', 'New to lifting'],
  ['returning', 'Coming back after a break'],
  ['regular', 'Training regularly']
]
const SESSION_MIN = [30, 45, 60, 75, 90]

// Equipment options come from the library's own taxonomy, most common first, so every choice
// on screen has exercises behind it.
export const EQUIPMENT = (() => {
  const count = {}
  EXDB.forEach(e => { if (e.eq) count[e.eq] = (count[e.eq] || 0) + 1 })
  return Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 14)
})()
// One-tap presets for the common situations; "full gym" is the empty list (= everything).
const PRESETS = [
  ['Full gym', []],
  ['Home: dumbbells', ['dumbbell', 'body weight']],
  ['Home: body weight', ['body weight']],
  ['Home: bands', ['band', 'resistance band', 'body weight']]
]

export const emptyProfile = () => ({
  goal: null, experience: null, daysPerWeek: 3, preferredDays: [1, 3, 5],
  sessionMin: 60, equipment: [], avoid: [], limitations: '', likes: '', dislikes: '', notes: ''
})

const STEPS = ['goal', 'experience', 'days', 'length', 'equipment', 'limits', 'extras']

export default function IntakeWizard({ initial, mode = 'rules', title, finishLabel, busy, onFinish, onBack }) {
  const [step, setStep] = useState(0)
  const [p, setP] = useState(() => ({ ...emptyProfile(), ...(initial || {}) }))
  const set = patch => setP(v => ({ ...v, ...patch }))

  const steps = mode === 'rules' ? STEPS.filter(s => s !== 'limits') : STEPS
  const key = steps[step]
  const canNext = key === 'goal' ? !!p.goal : key === 'experience' ? !!p.experience : true
  const last = step === steps.length - 1

  const toggleDay = d => set({
    preferredDays: p.preferredDays.includes(d) ? p.preferredDays.filter(x => x !== d) : [...p.preferredDays, d].sort()
  })
  const toggleEq = e => set({ equipment: p.equipment.includes(e) ? p.equipment.filter(x => x !== e) : [...p.equipment, e] })
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x))
  const addAvoid = () => exercisePicker(ex => { if (!p.avoid.includes(ex.id)) set({ avoid: [...p.avoid, ex.id] }) })

  // One question per screen: the title is the question, the answers are big tiles.
  const Q = ({ title: q, hint }) => <div className="wz-q">
    <div className="wz-n">{t('{0} of {1}', step + 1, steps.length)}</div>
    <h1>{q}</h1>
    {hint && <p>{hint}</p>}
  </div>
  const Tile = ({ on, onClick, children, className = '' }) =>
    <button className={'wz-tile ' + className + (on ? ' on' : '')} aria-pressed={!!on} onClick={onClick}>{children}</button>

  return <div className="wizard">
    <div className="wz-top">
      <button className="fx-ib" onClick={() => step ? setStep(step - 1) : onBack()} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="wz-rail" aria-label={t('Step {0} of {1}', step + 1, steps.length)}>
        {steps.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}
      </div>
    </div>
    {title && <div className="wz-title">{title}</div>}

    {key === 'goal' && <>
      <Q title={t('What are you training for?')} />
      <div className="wz-list">
        {GOALS.map(([v, label]) => <Tile key={v} on={p.goal === v} onClick={() => set({ goal: v })}>{t(label)}{p.goal === v && <Icon name="check" />}</Tile>)}
      </div>
      {p.goal === 'fatloss' && <div className="wz-hint">
        {t('Honest note: no exercise burns belly fat on its own. Training keeps your muscle while nutrition drives the deficit; the plan trains the whole body.')}
      </div>}
    </>}

    {key === 'experience' && <>
      <Q title={t('Where are you starting from?')} />
      <div className="wz-list">
        {EXPERIENCE.map(([v, label]) => <Tile key={v} on={p.experience === v} onClick={() => set({ experience: v })}>{t(label)}{p.experience === v && <Icon name="check" />}</Tile>)}
      </div>
    </>}

    {key === 'days' && <>
      <Q title={t('How many days a week?')} />
      <div className="wz-grid">
        {[1, 2, 3, 4, 5, 6].map(n => <Tile key={n} className="num" on={p.daysPerWeek === n} onClick={() => set({ daysPerWeek: n })}>
          <b>{n}</b><span>{t('a week')}</span></Tile>)}
      </div>
      <div className="wz-sub">{t('Which days suit you? (optional)')}</div>
      <div className="wz-days">
        {[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} aria-pressed={p.preferredDays.includes(d)} className={p.preferredDays.includes(d) ? 'on' : ''}
          onClick={() => toggleDay(d)} aria-label={t(DAYN[d])}>{t(DAYN[d]).slice(0, 2)}</button>)}
      </div>
      {p.preferredDays.length !== p.daysPerWeek && <div className="wz-hint">
        {t('Pick exactly {0} days to use them; otherwise the days are spread out for you.', p.daysPerWeek)}
      </div>}
    </>}

    {key === 'length' && <>
      <Q title={t('How long is a session?')} hint={t('The volume is fitted to the time you actually have, warm-up and rest between sets included.')} />
      <div className="wz-grid">
        {SESSION_MIN.map(n => <Tile key={n} className="num" on={p.sessionMin === n} onClick={() => set({ sessionMin: n })}><b>{n}</b><span>{t('min')}</span></Tile>)}
      </div>
    </>}

    {key === 'equipment' && <>
      <Q title={t('What can you train with?')} hint={t('Or pick everything you have access to. Leave it empty for the whole library.')} />
      <div className="wz-grid two">
        {PRESETS.map(([label, eqs]) => <Tile key={label} on={sameSet(p.equipment, eqs)} onClick={() => set({ equipment: eqs })}>{t(label)}</Tile>)}
      </div>
      <div className="wz-chips">
        {EQUIPMENT.map(e => <button key={e} className={'chip' + (p.equipment.includes(e) ? ' on' : '')}
          onClick={() => toggleEq(e)}>{t(e)}</button>)}
      </div>
    </>}

    {key === 'limits' && <>
      <Q title={t('Anything to work around?')} hint={t('Injuries, joints that complain, movements you cannot do, or practical limits like training at 6am in a flat.')} />
      <TextArea rows={4} maxLength={600} value={p.limitations} onChange={e => set({ limitations: e.target.value })}
        placeholder={t('e.g. “dodgy left shoulder — no barbell overhead press”')} />
      <div className="wz-hint warn">
        {t('If something actually hurts, see a professional — the Coach will program conservatively but it cannot diagnose anything.')}
      </div>
    </>}

    {key === 'extras' && mode === 'rules' && <>
      <Q title={t('Exercises to leave out')} hint={t('Anything that hurts, that you cannot do where you train, or that you simply hate. They are never picked, not even as alternatives.')} />
      {p.avoid.length > 0 && <div className="list" style={{ marginBottom: 10 }}>
        {p.avoid.map(id => { const ex = exOr(id); return <div key={id} className="item">
          <Thumb ex={ex} />
          <div className="grow"><div className="tt capitalize">{ex.n}</div><div className="ss capitalize">{t(ex.tg || ex.bp)}</div></div>
          <button className="iconbtn" aria-label={t('Remove')} onClick={() => set({ avoid: p.avoid.filter(x => x !== id) })}><Icon name="xmark" /></button>
        </div> })}
      </div>}
      <Button icon="plus" onClick={addAvoid}>{t('Add an exercise to avoid')}</Button>
      <div className="wz-hint warn">
        {t('If something actually hurts, see a professional. This is a training suggestion, not medical advice.')}
      </div>
    </>}

    {key === 'extras' && mode !== 'rules' && <>
      <Q title={t('Anything else?')} />
      <div className="wz-sub">{t('Exercises you love')}</div>
      <TextArea rows={2} maxLength={300} value={p.likes} onChange={e => set({ likes: e.target.value })} placeholder={t('e.g. “deadlifts, anything with a kettlebell”')} />
      <div className="wz-sub">{t('Exercises you would rather not')}</div>
      <TextArea rows={2} maxLength={300} value={p.dislikes} onChange={e => set({ dislikes: e.target.value })} placeholder={t('e.g. “I hate lunges”')} />
      <div className="wz-sub">{t('Anything you want the Coach to know')}</div>
      <TextArea rows={3} maxLength={600} value={p.notes} onChange={e => set({ notes: e.target.value })} placeholder={t('e.g. “I want visible arms progress by spring”')} />
    </>}

    <div className="wz-foot">
      {!last
        ? <button className="wl-btn ink" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('Continue')}</button>
        : <button className="wl-btn ink" disabled={busy} onClick={() => onFinish(p)}><Icon name="sparkles" />{finishLabel}</button>}
    </div>
  </div>
}
