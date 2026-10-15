import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { emptyCoach, coachAvailable } from '../lib/coach.js'
import { requestPlan } from '../lib/coach-api.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import IntakeWizard from './IntakeWizard.jsx'

/* The AI Coach's intake: the shared wizard in its free-text flavour, then a plan request to the
   server. The answers are kept on the Coach profile, so the rule-based builder can start from
   them too (and vice versa). */

export default function CoachIntake() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(false)

  if (!coachAvailable(config, user, { demo: DEMO, mobile: MOBILE })) { nav('/home', { replace: true }); return null }

  const finish = async p => {
    update(s => { const c = (s.coach = s.coach || emptyCoach()); c.profile = p })
    if (editing) { toast(t('Saved')); nav('/coach'); return }
    setBusy(true)
    try {
      await requestPlan(p)
      toast(t('The Coach is building your plan…'))
      nav('/coach')
    } catch (e) { toast(e.message || t('Could not ask the Coach')); setBusy(false) }
  }

  return <IntakeWizard mode="ai" initial={S.coach?.profile || S.builderProfile || null} busy={busy}
    title={editing ? t('Coach profile') : t('Your plan')} finishLabel={editing ? t('Save') : t('Build my plan')}
    onFinish={finish} onBack={() => nav('/coach')} />
}
