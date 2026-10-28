import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { WorkoutRow, workoutDetailSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// Rendered a page at a time: years of history drawn in one go took over a second on a phone.
const PAGE = 40

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [shown, setShown] = useState(PAGE)
  const total = S.workouts.length
  const rows = []
  for (let i = total - 1; i >= 0 && rows.length < shown; i--) rows.push(S.workouts[i])
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Workouts')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 12 }}><h1>{t('History')}</h1><div className="sub">{t('{0} workouts', S.workouts.length)}</div></div></div>
    {total ? <>
      <div className="list">{rows.map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
      {total > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(n => n + PAGE * 2)}>{t('Show more')} ({total - shown})</Button></>}
    </>
      : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet.')}</div>}
  </>
}
