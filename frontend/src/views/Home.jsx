import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { effectiveRoutine, effectiveRoutineId, streakWeeks, lastBW, setsDoneActive } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, isoOf, weekKey, DAYS } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { measureSheet, bwSheet, dayOverrideSheet, calendarSheet, startFlow, loadStarterPlan } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { coachAvailable, hasConsent } from '../lib/coach.js'
import { useCoachStatus } from '../lib/coach-api.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { backupDue, exportBackup, SNOOZE_DAYS } from '../lib/backup.js'
import { series as measureSeries, change as measureChange, lengthUnit } from '../lib/measures.js'
import { estimateMinutes } from '../lib/program-builder.js'
import { exOr } from '../lib/exercises.js'

// A job in flight or a proposal waiting is the only reason the Coach interrupts Home. When it
// has nothing to say it renders nothing at all — and it only polls while Home is on screen.
function CoachCard({ nav }) {
  const S = useStore(s => s.S)
  const { job, pending } = useCoachStatus(hasConsent(S))
  if (!hasConsent(S) || (!job && !pending)) return null
  const ready = !!pending
  return <button className="row-card" onClick={() => nav(ready ? '/coach/proposal' : '/coach')}>
    <span className="row-card-m">
      <span className="row-card-t">{ready
        ? (pending.kind === 'create'
          ? t('Your plan is ready')
          : t(pending.changes?.length === 1 ? '{0} suggestion for you' : '{0} suggestions for you', pending.changes?.length || 0))
        : t('Reading your training…')}</span>
      <span className="row-card-s">{t('Coach')}</span>
    </span>
    {ready ? <span className="row-card-go sig">{t('Review')}</span> : <Icon name="chevronRight" className="chev" />}
  </button>
}

// The waist under the weight: for fat loss with muscle gain it is the number that moves.
function WaistRow({ S }) {
  const pts = measureSeries(S, 'waist', S.unit)
  const unit = lengthUnit(S.unit)
  const last = pts[pts.length - 1]
  const d30 = measureChange(S, 'waist', 30, S.unit)
  return <button className="row-card" onClick={measureSheet}>
    <span className="row-card-m">
      <span className="row-card-t">{t('Waist')}</span>
      <span className="row-card-s">{last
        ? <>{fmtNum(last.y)} {unit}{d30 != null && d30 !== 0 && <> · {(d30 > 0 ? '+' : '') + fmtNum(d30)} {unit} {t('in 30 days')}</>}</>
        : t('Add your waist measurement')}</span>
    </span>
    <span className="row-card-go">{t('Log')}</span>
  </button>
}

// Monthly nudge to keep a copy of your data off the server (see lib/backup.js).
function BackupCard({ S }) {
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const since = S.lastBackup
  const go = async () => {
    if (await exportBackup(S)) { update(s => { s.lastBackup = todayISO(); s.backupSnooze = null }); toast(t('Backup exported')) }
  }
  const later = () => {
    const d = new Date(); d.setDate(d.getDate() + SNOOZE_DAYS)
    update(s => { s.backupSnooze = isoOf(d) })
  }
  return <div className="card backup-card">
    <div className="ttl" style={{ fontWeight: 600, fontSize: 17, letterSpacing: '-.02em' }}>{t('Time for a backup')}</div>
    <div className="muted small" style={{ marginTop: 4 }}>{since ? t('Last backup: {0}. Save a copy in Files or iCloud, so a server problem can never cost you your history.', fmtDate(since, true)) : t('Save a copy in Files or iCloud, so a server problem can never cost you your history.')}</div>
    <div className="row" style={{ gap: 8, marginTop: 14 }}>
      <Button size="sm" variant="primary" icon="download" onClick={go}>{t('Export now')}</Button>
      <Button size="sm" onClick={later}>{t('Later')}</Button>
    </div>
  </div>
}

// The one thing to do today, as big as the screen allows: the session, a resume, or a rest day.
function Hero({ S, routine, todayOvr, nav }) {
  if (S.active) {
    const A = S.active
    const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
    return <div className="hero">
      <div className="hero-k"><span className="live-dot" aria-hidden="true" />{t('In progress')}</div>
      <h1 className="hero-h">{A.name}</h1>
      <div className="hero-stats">
        <div><b>{setsDoneActive(A)}/{total}</b><span>{t('sets')}</span></div>
        <div><b>{Math.max(1, Math.round((Date.now() - A.start) / 60000))}</b><span>{t('minutes')}</span></div>
      </div>
      <button className="hero-go" onClick={() => nav('/workout')}><Icon name="play" />{t('Resume')}</button>
    </div>
  }
  if (!routine) {
    return <div className="hero quiet">
      <div className="hero-k">{t('Today')}</div>
      <h1 className="hero-h">{t('Rest day')}</h1>
      <div className="hero-p">{t('Recovery is part of the plan. Want to train anyway? Pick a session for today.')}</div>
      <button className="hero-go ink" onClick={() => dayOverrideSheet(todayISO())}>{t('Train anyway')}</button>
    </div>
  }
  const sets = routine.ex.reduce((n, e) => n + (+e.sets || 1), 0)
  const mins = routine.minutes || estimateMinutes(routine)
  return <div className="hero">
    <div className="hero-top">
      <div className="hero-k">{t('Today')}{todayOvr ? ' · ' + t('rescheduled') : ''}</div>
      <button className="hero-chg" onClick={() => dayOverrideSheet(todayISO())}>{t('Change')}</button>
    </div>
    <h1 className="hero-h">{routine.name}</h1>
    <div className="hero-stats">
      <div><b>{mins}</b><span>{t('minutes')}</span></div>
      <div><b>{routine.ex.length}</b><span>{t('exercises')}</span></div>
      <div><b>{sets}</b><span>{t('sets')}</span></div>
    </div>
    {!!routine.ex.length && <div className="hero-p">{routine.ex.map(e => { const n = exOr(e.id).n; return n.charAt(0).toUpperCase() + n.slice(1) }).join(' · ')}</div>}
    <button className="hero-go" onClick={() => startFlow(routine.id)}><Icon name="play" />{t('Start')}</button>
  </div>
}

export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const [weekOffset, setWeekOffset] = useState(0)
  const coachOn = coachAvailable(config, user, { demo: DEMO, mobile: MOBILE })

  const today = new Date()
  const tISO = todayISO()
  const routine = effectiveRoutine(S, tISO)
  const todayOvr = S.dayPlan[tISO] !== undefined
  const bw = lastBW(S)

  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const iso = isoOf(d)
    const planned = !!effectiveRoutineId(S, iso), done = doneDays.has(iso), isToday = iso === tISO
    const cls = done ? ' done' : isToday && planned ? ' today' : planned ? ' plan' : ''
    days.push(<button key={i} className={'wbar' + cls + (isToday ? ' is-today' : '')} onClick={() => dayOverrideSheet(iso)}
      aria-label={d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric' })}>
      <i /><span>{t(DAYS[d.getDay()])}</span></button>)
  }
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${monday.getDate()} ${monday.toLocaleDateString(dateLocale(), { month: 'short' })} – ${sunday.getDate()} ${sunday.toLocaleDateString(dateLocale(), { month: 'short' })}`
  const wk = weekKey(isoOf(monday))
  const wDone = S.workouts.filter(w => weekKey(w.d) === wk).length
  const plannedPerWeek = Object.keys(S.week).filter(k => S.week[k]).length
  const streak = streakWeeks(S)
  const initial = (user?.name || '').trim().charAt(0).toUpperCase()

  return <div className="narrow home">
    <div className="home-top">
      <div className="home-date">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <button className="avatar" onClick={() => nav('/settings')} aria-label={t('Settings')}>{initial || <Icon name="gear" />}</button>
    </div>

    {!S.routines.length && !S.active ? (
      <div className="hero">
        <div className="hero-k">{t('Welcome!')}</div>
        <h1 className="hero-h">{t('Build my program')}</h1>
        <div className="hero-p">{t('Answer a few questions — goal, days, time, equipment — and get a plan that fits your week.')}</div>
        <button className="hero-go" onClick={() => nav('/builder')}>{t('Start')}</button>
        <div className="hero-alt">
          {coachOn && <button onClick={() => nav(hasConsent(S) ? '/coach/intake' : '/coach')}>{t('Let the Coach build it')}</button>}
          <button onClick={loadStarterPlan}>{t('Load starter plan (PPL)')}</button>
          <button onClick={() => nav('/plan')}>{t('Build my own plan')}</button>
        </div>
      </div>
    ) : <Hero S={S} routine={routine} todayOvr={todayOvr} nav={nav} />}

    {coachOn && <CoachCard nav={nav} />}
    {!DEMO && backupDue(S) && <BackupCard S={S} />}

    <button className="row-card" onClick={() => bwSheet()}>
      <span className="row-card-m">
        <span className="row-card-t">{t("Today's weight")}</span>
        <span className="row-card-s">{bw ? t('Last: {0}', fmtNum(bw.w) + ' ' + S.unit + ', ' + fmtDate(bw.d, true)) : t('No entries yet')}</span>
      </span>
      <span className="row-card-go">{t('Log')}</span>
    </button>
    <WaistRow S={S} />

    <section className="wk">
      <div className="wk-h">
        <button className="wk-nav" onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
        <h2>{wkLabel}</h2>
        {weekOffset !== 0 && <button className="wk-nav" onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>}
        <span className="wk-n">{plannedPerWeek ? t('{0} of {1}', wDone, plannedPerWeek) : wDone}</span>
      </div>
      <div className="wbars">{days}</div>
      <button className="wk-streak" onClick={() => calendarSheet()}>
        <Icon name="flame" />{t('{0} week streak', streak)} · {t(S.workouts.length === 1 ? '{0} workout total' : '{0} workouts total', S.workouts.length)}
        <Icon name="chevronRight" className="chev" />
      </button>
    </section>
  </div>
}
