import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { DAYN } from '../lib/format.js'
import { EXDB, exOr } from '../lib/exercises.js'
import { exercisePicker } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'
import { Button, TextArea, Segmented } from '../components/ui.jsx'

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

const STEPS = ['goal', 'days', 'length', 'equipment', 'limits', 'extras']

export default function IntakeWizard({ initial, mode = 'rules', title, finishLabel, busy, onFinish, onBack }) {
  const [step, setStep] = useState(0)
  const [p, setP] = useState(() => ({ ...emptyProfile(), ...(initial || {}) }))
  const set = patch => setP(v => ({ ...v, ...patch }))

  const steps = mode === 'rules' ? STEPS.filter(s => s !== 'limits') : STEPS
  const key = steps[step]
  const canNext = key !== 'goal' || (p.goal && p.experience)
  const last = step === steps.length - 1

  const toggleDay = d => set({
    preferredDays: p.preferredDays.includes(d) ? p.preferredDays.filter(x => x !== d) : [...p.preferredDays, d].sort()
  })
  const toggleEq = e => set({ equipment: p.equipment.includes(e) ? p.equipment.filter(x => x !== e) : [...p.equipment, e] })
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x))
  const addAvoid = () => exercisePicker(ex => { if (!p.avoid.includes(ex.id)) set({ avoid: [...p.avoid, ex.id] }) })

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => step ? setStep(step - 1) : onBack()} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}>
        <h1>{title}</h1>
        <div className="sub">{t('Step {0} of {1}', step + 1, steps.length)}</div>
      </div>
    </div>

    {/* progress rail — the wizard's only chrome; a row of bars reads faster than "1 of 6" alone */}
    <div className="row" style={{ gap: 5, marginBottom: 14 }}>
      {steps.map((s, i) => <div key={s} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? 'var(--acc)' : 'var(--surface-3)' }} />)}
    </div>

    <div className="card">
      {key === 'goal' && <>
        <h2 style={{ marginTop: 0 }}>{t('What are you training for?')}</h2>
        <div className="sect-b">
          {GOALS.map(([v, label]) => <button key={v} className="lrow tap" onClick={() => set({ goal: v })}>
            <span className="lrow-m"><span className="lrow-t">{t(label)}</span></span>
            {p.goal === v && <Icon name="check" className="lrow-k" />}
          </button>)}
        </div>
        {p.goal === 'fatloss' && <div className="dim small" style={{ margin: '0 2px 10px', lineHeight: 1.5 }}>
          {t('Honest note: no exercise burns belly fat on its own. Training keeps your muscle while nutrition drives the deficit; the plan trains the whole body.')}
        </div>}
        <h2>{t('Where are you starting from?')}</h2>
        <div className="sect-b">
          {EXPERIENCE.map(([v, label]) => <button key={v} className="lrow tap" onClick={() => set({ experience: v })}>
            <span className="lrow-m"><span className="lrow-t">{t(label)}</span></span>
            {p.experience === v && <Icon name="check" className="lrow-k" />}
          </button>)}
        </div>
      </>}

      {key === 'days' && <>
        <h2 style={{ marginTop: 0 }}>{t('How many days a week?')}</h2>
        <Segmented options={[1, 2, 3, 4, 5, 6].map(n => ({ value: n, label: String(n) }))}
          value={p.daysPerWeek} onChange={v => set({ daysPerWeek: v })} />
        <div className="muted small" style={{ margin: '14px 0 8px' }}>{t('Which days suit you? (optional)')}</div>
        <div className="week">
          {[1, 2, 3, 4, 5, 6, 0].map(d => <div key={d} className={'wday' + (p.preferredDays.includes(d) ? ' today' : '')}
            onClick={() => toggleDay(d)} style={{ cursor: 'pointer' }}>
            <div className="lbl">{t(DAYN[d]).slice(0, 2)}</div>
            <div className={'dot' + (p.preferredDays.includes(d) ? ' plan' : '')} />
          </div>)}
        </div>
        {p.preferredDays.length !== p.daysPerWeek && <div className="dim small" style={{ marginTop: 10 }}>
          {t('Pick exactly {0} days to use them; otherwise the days are spread out for you.', p.daysPerWeek)}
        </div>}
      </>}

      {key === 'length' && <>
        <h2 style={{ marginTop: 0 }}>{t('How long is a session?')}</h2>
        <Segmented options={SESSION_MIN.map(n => ({ value: n, label: n + ' ' + t('min') }))}
          value={p.sessionMin} onChange={v => set({ sessionMin: v })} />
        <div className="muted small" style={{ marginTop: 12 }}>{t('The volume is fitted to the time you actually have, warm-up and rest between sets included.')}</div>
      </>}

      {key === 'equipment' && <>
        <h2 style={{ marginTop: 0 }}>{t('What can you train with?')}</h2>
        <div className="chips" style={{ marginBottom: 12 }}>
          {PRESETS.map(([label, eqs]) => <button key={label} className={'chip nocap' + (sameSet(p.equipment, eqs) ? ' on' : '')} onClick={() => set({ equipment: eqs })}>{t(label)}</button>)}
        </div>
        <div className="muted small" style={{ marginBottom: 10 }}>{t('Or pick everything you have access to. Leave it empty for the whole library.')}</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 7 }}>
          {EQUIPMENT.map(e => <button key={e} className={'chip' + (p.equipment.includes(e) ? ' on' : '')}
            onClick={() => toggleEq(e)}>{t(e)}</button>)}
        </div>
      </>}

      {key === 'limits' && <>
        <h2 style={{ marginTop: 0 }}>{t('Anything to work around?')}</h2>
        <div className="muted small" style={{ marginBottom: 10 }}>
          {t('Injuries, joints that complain, movements you cannot do, or practical limits like training at 6am in a flat.')}
        </div>
        <TextArea rows={4} maxLength={600} value={p.limitations} onChange={e => set({ limitations: e.target.value })}
          placeholder={t('e.g. “dodgy left shoulder — no barbell overhead press”')} />
        <div className="dim small" style={{ marginTop: 8, lineHeight: 1.5, color: 'var(--yellow)' }}>
          {t('If something actually hurts, see a professional — the Coach will program conservatively but it cannot diagnose anything.')}
        </div>
      </>}

      {key === 'extras' && mode === 'rules' && <>
        <h2 style={{ marginTop: 0 }}>{t('Exercises to leave out')}</h2>
        <div className="muted small" style={{ marginBottom: 10 }}>{t('Anything that hurts, that you cannot do where you train, or that you simply hate. They are never picked, not even as alternatives.')}</div>
        {p.avoid.length > 0 && <div className="list" style={{ marginBottom: 10 }}>
          {p.avoid.map(id => { const ex = exOr(id); return <div key={id} className="item">
            <Thumb ex={ex} />
            <div className="grow"><div className="tt capitalize">{ex.n}</div><div className="ss capitalize">{t(ex.tg || ex.bp)}</div></div>
            <button className="iconbtn" aria-label={t('Remove')} onClick={() => set({ avoid: p.avoid.filter(x => x !== id) })}><Icon name="xmark" /></button>
          </div> })}
        </div>}
        <Button icon="plus" onClick={addAvoid}>{t('Add an exercise to avoid')}</Button>
        <div className="dim small" style={{ marginTop: 14, lineHeight: 1.5, color: 'var(--yellow)' }}>
          {t('If something actually hurts, see a professional. This is a training suggestion, not medical advice.')}
        </div>
      </>}

      {key === 'extras' && mode !== 'rules' && <>
        <h2 style={{ marginTop: 0 }}>{t('Anything else?')}</h2>
        <div className="muted small" style={{ marginBottom: 6 }}>{t('Exercises you love')}</div>
        <TextArea rows={2} maxLength={300} value={p.likes} onChange={e => set({ likes: e.target.value })} placeholder={t('e.g. “deadlifts, anything with a kettlebell”')} />
        <div className="muted small" style={{ margin: '12px 0 6px' }}>{t('Exercises you would rather not')}</div>
        <TextArea rows={2} maxLength={300} value={p.dislikes} onChange={e => set({ dislikes: e.target.value })} placeholder={t('e.g. “I hate lunges”')} />
        <div className="muted small" style={{ margin: '12px 0 6px' }}>{t('Anything you want the Coach to know')}</div>
        <TextArea rows={3} maxLength={600} value={p.notes} onChange={e => set({ notes: e.target.value })} placeholder={t('e.g. “I want visible arms progress by spring”')} />
      </>}
    </div>

    <div className="row" style={{ gap: 10 }}>
      {step > 0 && <Button onClick={() => setStep(step - 1)} style={{ flex: 1 }}>{t('Back')}</Button>}
      {!last
        ? <Button variant="primary" style={{ flex: 1 }} disabled={!canNext} onClick={() => setStep(step + 1)}>{t('Next')}</Button>
        : <Button variant="primary" style={{ flex: 1 }} icon="sparkles" disabled={busy} onClick={() => onFinish(p)}>{finishLabel}</Button>}
    </div>
    {!canNext && <div className="dim small" style={{ textAlign: 'center', marginTop: 10 }}>{t('Pick a goal and where you are starting from to continue.')}</div>}
    <div style={{ height: 20 }} />
  </div>
}
