import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, DAYS, uid, fmtDate, isoOf } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { dayAssignSheet, loadStarterPlan, planToolsSheet, workoutDetailSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { DEFAULT_GLYPH } from '../lib/glyphs.js'
import { coachAvailable } from '../lib/coach.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { estimateMinutes } from '../lib/program-builder.js'
import { effectiveRoutineId, setsDone } from '../lib/history.js'

const ORDER = [1, 2, 3, 4, 5, 6, 0]   // Monday first
const letter = i => String.fromCharCode(65 + (i % 26))

// Allenamenti: the plan (week schedule + sessions), and what you have already done with it.
export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const update = useStore(s => s.update)
  const coachOn = coachAvailable(config, user, { demo: DEMO, mobile: MOBILE })

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  const idxOf = id => S.routines.findIndex(r => r.id === id)
  const daysOf = id => ORDER.filter(d => S.week[d] === id)
  const trainingDays = ORDER.filter(d => S.week[d] && idxOf(S.week[d]) >= 0)
  // The session in ink is the one coming up next: today's if there is one, else the next
  // scheduled day's.
  const nextId = (() => {
    const d = new Date()
    for (let i = 0; i < 7; i++) {
      const day = new Date(d); day.setDate(d.getDate() + i)
      const id = effectiveRoutineId(S, isoOf(day))
      if (id) return id
    }
    return null
  })()
  const recent = S.workouts.slice(-3).reverse()

  return <div className="narrow plan">
    <div className="hdr">
      <h1>{t('Workouts')}</h1>
      <div className="row" style={{ gap: 8 }}>
        {coachOn && <button className="iconbtn" onClick={() => nav('/coach')} aria-label={t('Coach')} title={t('Coach')}><Icon name="sparkles" /></button>}
        <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
      </div>
    </div>

    {S.routines.length ? <>
      <div className="pcard">
        <div className="pcard-h">
          <div className="pcard-m">
            <span className="pcard-k">{t('Your weekly routine')}</span>
            <span className="pcard-t">{t(trainingDays.length === 1 ? '{0} day a week' : '{0} days a week', trainingDays.length)}</span>
            <span className="pcard-s">{trainingDays.length ? trainingDays.map(d => t(DAYN[d])).join(' · ') : t('Tap a day to schedule a session.')}</span>
          </div>
          <button className="pcard-b" onClick={() => nav('/builder')}>{t('New plan')}</button>
        </div>
        <div className="pweek" aria-label={t('Week schedule')}>
          {ORDER.map(d => {
            const i = idxOf(S.week[d])
            return <button key={d} className={i >= 0 ? (S.week[d] === nextId ? 'on next' : 'on') : ''} onClick={() => dayAssignSheet(d)}
              aria-label={t(DAYN[d]) + ': ' + (i >= 0 ? S.routines[i].name : t('Rest'))}>
              <span>{t(DAYS[d])}</span><b>{i >= 0 ? letter(i) : '–'}</b>
            </button>
          })}
        </div>
      </div>

      <div className="psess">
        {S.routines.map((r, i) => {
          const days = daysOf(r.id)
          return <button key={r.id} className={'psess-c' + (r.id === nextId ? ' ink' : '')} onClick={() => nav('/plan/r/' + r.id)}>
            <span className="psess-k">{letter(i)}{days.length ? ' · ' + days.map(d => t(DAYS[d])).join(' ') : ''}</span>
            <span className="psess-m"><span className="psess-t">{r.name}</span>
              <span className="psess-s">{t(r.ex.length === 1 ? '{0} exercise' : '{0} exercises', r.ex.length)}{r.ex.length ? ' · ' + t('{0} min', r.minutes || estimateMinutes(r)) : ''}</span></span>
          </button>
        })}
        <button className="psess-c add" onClick={addRoutine}><Icon name="plus" /><span className="psess-t">{t('New routine')}</span></button>
      </div>
    </> : <div className="pcard">
      <div className="pcard-m">
        <span className="pcard-t">{t('No routines yet.')}</span>
        <span className="pcard-s">{t('Answer a few questions and get a plan that fits your week, or load the starter plan.')}</span>
      </div>
      <div style={{ height: 14 }} />
      <Button variant="primary" icon="clipboard" onClick={() => nav('/builder')}>{t('Build my program')}</Button>
      <div style={{ height: 8 }} />
      <Button icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (Push / Pull / Legs)')}</Button>
      <div style={{ height: 8 }} />
      <Button onClick={addRoutine}>{t('Build my own plan')}</Button>
    </div>}

    <button className="row-card" onClick={() => nav('/library')}>
      <span className="row-card-m"><span className="row-card-t">{t('Exercise library')}</span>
        <span className="row-card-s">{t('Every exercise, with how-to and your notes')}</span></span>
      <Icon name="chevronRight" className="chev" />
    </button>

    <section className="plist">
      <div className="plist-h"><h2>{t('History')}</h2>{S.workouts.length > 0 && <button onClick={() => nav('/history')}>{t('See all')}</button>}</div>
      {recent.length ? recent.map(w => {
        const d = new Date(w.d + 'T12:00:00')
        const mins = w.end && w.start ? Math.round((w.end - w.start) / 60000) : null
        return <button key={w.id} className="plist-r" onClick={() => workoutDetailSheet(w)}>
          <span className="plist-d">{d.toLocaleDateString(dateLocale(), { weekday: 'short' })}<br />{fmtDate(w.d)}</span>
          <span className="plist-m"><span className="plist-t">{w.name || t('Workout')}</span>
            <span className="plist-s">{mins ? t('{0} min', mins) + ' · ' : ''}{t('{0} sets', setsDone(w))}</span></span>
          {w.prs?.length > 0 && <span className="tag acc">{t('Record')}</span>}
        </button>
      }) : <div className="muted small" style={{ padding: '4px 2px' }}>{t('No workouts yet.')}</div>}
    </section>
  </div>
}
