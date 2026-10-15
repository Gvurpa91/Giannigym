import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DAYN, exCount } from '../lib/format.js'
import { exOr } from '../lib/exercises.js'
import { exLine } from '../lib/history.js'
import { parsePlan, mergePlan } from '../lib/plan-share.js'
import { buildProgram, swapExercise, removeExercise, toPlanFile, estimateMinutes } from '../lib/program-builder.js'
import { glyphOf } from '../lib/glyphs.js'
import { exerciseDetailSheet, confirmSheet } from '../sheets.jsx'
import IntakeWizard from './IntakeWizard.jsx'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'
import { Button, Switch } from '../components/ui.jsx'

/* The rule-based program builder: answers → plan → review and edit → apply.
   No server, no account, no AI — it runs the same in guest mode, in the demo and on the
   standalone mobile build, and applying the plan is the ordinary plan-import path. */

export default function ProgramBuilder() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const [profile, setProfile] = useState(() => S.builderProfile || S.coach?.profile || null)
  const [bundle, setBundle] = useState(null)
  const [schedule, setSchedule] = useState(true)

  const generate = p => {
    setProfile(p)
    update(s => { s.builderProfile = p })
    setBundle(buildProgram(p))
    window.scrollTo(0, 0)
  }

  if (!bundle) {
    return <IntakeWizard mode="rules" initial={profile} title={t('Build my program')} finishLabel={t('Build my program')}
      onFinish={generate} onBack={() => nav(-1)} />
  }

  const apply = () => {
    const parsed = parsePlan(toPlanFile(bundle))
    const replaces = S.routines.length > 0 && schedule
    const go = () => {
      update(s => mergePlan(s, parsed, { schedule }))
      toast(t('Added {0} routines to your plan', parsed.routineCount))
      nav('/plan')
    }
    if (replaces) confirmSheet({
      title: t('Use this weekly schedule?'),
      message: t('Your existing routines are kept, but the Mon–Sun assignments are replaced by the new plan.'),
      confirmText: t('Use this plan'), onConfirm: go
    })
    else go()
  }

  const swap = (r, i, altId) => setBundle(b => swapExercise(b, r.id, i, altId, profile))
  const remove = (r, i) => setBundle(b => removeExercise(b, r.id, i))
  const weekDays = [1, 2, 3, 4, 5, 6, 0]

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => setBundle(null)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{bundle.name}</h1><div className="sub">{bundle.basedOn}</div></div>
    </div>

    <div className="card">
      <div className="muted small" style={{ lineHeight: 1.5 }}>{bundle.summary}</div>
      <div className="dim small" style={{ marginTop: 8, lineHeight: 1.5 }}>{t('This is a training suggestion, not medical advice. Results depend on consistency, sleep and nutrition — nothing here is guaranteed.')}</div>
    </div>

    <h4 className="sec">{t('Week schedule')}</h4>
    <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
      {weekDays.map(d => {
        const r = bundle.routines.find(x => x.id === bundle.week[d])
        return <div key={d} className="item">
          <div className="grow"><div className="tt">{t(DAYN[d])}</div></div>
          {r ? <span className="tag acc"><Icon name={glyphOf(r.emoji)} />{r.name}</span> : <span className="tag">{t('Rest')}</span>}
        </div>
      })}
    </div>

    {bundle.routines.map(r => <div key={r.id} className="card" style={{ marginTop: 14 }}>
      <div className="row between" style={{ marginBottom: 4 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
          <div><div className="big" style={{ fontSize: 20 }}>{r.name}</div><div className="small muted">{exCount(r.ex.length)} · {t('about {0} min', estimateMinutes(r, profile.sessionMin))}</div></div>
        </div>
      </div>
      <div className="list" style={{ marginTop: 10 }}>
        {r.ex.map((e, i) => {
          const ex = exOr(e.id)
          const linkedPrev = i > 0 && e.sg && r.ex[i - 1].sg === e.sg
          return <div key={e.id + i}>
            {e.sg && !linkedPrev && r.ex[i + 1]?.sg === e.sg && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
            <div className={'item' + (e.sg ? ' in-ss' : '')} style={{ alignItems: 'flex-start' }} onClick={() => exerciseDetailSheet(ex)}>
              <Thumb ex={ex} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="tt capitalize">{ex.n}</div>
                <div className="ss">{exLine(e, S.unit)} · <span className="capitalize">{t(ex.tg || ex.bp)}</span></div>
                <div className="dim" style={{ fontSize: '.74rem', marginTop: 3, lineHeight: 1.4 }}>{e.why}</div>
                {e.alt.length > 0 && <div className="chips" style={{ marginTop: 6 }}>
                  <span className="dim" style={{ fontSize: '.72rem', alignSelf: 'center' }}>{t('Swap for:')}</span>
                  {e.alt.map(a => <button key={a.id} className="chip" style={{ fontSize: '.72rem' }} onClick={ev => { ev.stopPropagation(); swap(r, i, a.id) }}>{exOr(a.id).n}</button>)}
                </div>}
              </div>
              <button className="iconbtn" aria-label={t('Remove')} title={t('Remove')} onClick={ev => { ev.stopPropagation(); remove(r, i) }}><Icon name="xmark" /></button>
            </div>
          </div>
        })}
      </div>
      {r.ex.length === 0 && <div className="empty">{t('No exercises yet.')}</div>}
    </div>)}

    <div className="row between" style={{ padding: '12px 2px', borderTop: '1px solid var(--sep)', borderBottom: '1px solid var(--sep)', margin: '16px 0', gap: 12 }}>
      <div><div className="tt" style={{ fontSize: 15 }}>{t('Use this weekly schedule')}</div><div className="small dim">{t('Replaces your current Mon–Sun assignments.')}</div></div>
      <Switch checked={schedule} onChange={setSchedule} />
    </div>
    <div className="dim small" style={{ marginBottom: 12, lineHeight: 1.4 }}>{t('Routines are added next to the ones you already have; you can fine-tune sets, reps and progression in the Plan tab afterwards.')}</div>
    <Button variant="primary" icon="check" onClick={apply}>{t('Use this plan')}</Button>
    <div style={{ height: 8 }} />
    <Button icon="reset" onClick={() => setBundle(buildProgram(profile))}>{t('Rebuild from my answers')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={() => setBundle(null)}>{t('Change my answers')}</Button>
    <div style={{ height: 30 }} />
  </div>
}
