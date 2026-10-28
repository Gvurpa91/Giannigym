import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { setsDoneActive } from '../lib/history.js'
import { t } from '../lib/i18n.js'

// Three places, one pill: Today, Workouts (plan, library, history) and Progress. Starting a
// session lives on Today's hero card, so there is no centre button. While a workout runs the
// workout screen is full-screen focus mode with no bar at all; anywhere else but Today (whose
// hero card already says "Resume") a strip sits above the pill so the session is one tap away.
const SECTION = { home: 'today', settings: 'today', plan: 'train', library: 'train', workout: 'train', history: 'train', stats: 'progress' }
const HIDDEN = ['builder', 'coach']

const clock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function ResumeStrip({ active, onOpen }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const total = active.entries.reduce((n, e) => n + e.sets.length, 0)
  return (
    <button className="resume" onClick={onOpen}>
      <span className="resume-dot" aria-hidden="true" />
      <span className="resume-m"><span className="resume-t">{active.name}</span>
        <span className="resume-s">{clock(now - active.start)} · {t('{0} of {1} sets', setsDoneActive(active), total)}</span></span>
      <span className="resume-go">{t('Resume')}</span>
    </button>
  )
}

export default function TabBar() {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  if (!user && !isGuest) return null
  const cur = loc.pathname.split('/')[1] || 'home'
  if (HIDDEN.includes(cur)) return null
  if (cur === 'workout' && S.active) return null
  const sec = SECTION[cur] || 'today'
  const Tab = ({ k, to, label }) => (
    <a href={'#' + to} className={sec === k ? 'on' : ''} aria-current={sec === k ? 'page' : undefined}
      onClick={e => { e.preventDefault(); nav(to) }}>{label}</a>
  )
  return (
    <div id="tabbar">
      {S.active && cur !== 'home' && <ResumeStrip active={S.active} onOpen={() => nav('/workout')} />}
      <nav className="pillnav" aria-label={t('Main navigation')}>
        <Tab k="today" to="/home" label={t('Today')} />
        <Tab k="train" to="/plan" label={t('Workouts')} />
        <Tab k="progress" to="/stats" label={t('Progress')} />
      </nav>
    </div>
  )
}

