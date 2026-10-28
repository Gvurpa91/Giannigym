import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyLogin, passkeyRegister, api, BIO } from '../lib/api.js'
import { hasData } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { APP_NAME } from '../lib/brand.js'
import { useState, useRef, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

function RegisterSheet({ close }) {
  const { setUser, pushState, pullState } = useStore()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [inviteOnly, setInviteOnly] = useState(false)
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  useEffect(() => { api('/api/config').then(c => setInviteOnly(!!c.invite_only)).catch(() => {}) }, [])
  const go = async () => {
    const n = name.trim()
    if (!n) { useUI.getState().toast(t('Enter a name')); return }
    if (inviteOnly && !code.trim()) { useUI.getState().toast(t('An invite code is required')); return }
    try {
      const u = await passkeyRegister(n, code.trim())
      setUser(u); close()
      if (hasData(useStore.getState().S)) { await pushState(); useUI.getState().toast(t('Profile created — data from this device moved into it')) }
      else { await pullState(); useUI.getState().toast(t('Welcome, {0}', u.name)) }
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Registration failed')) }
  }
  return <>
    <h3>{t('Create your profile')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Pick a name, then confirm with {0}. The passkey is saved in your device — no password needed.', BIO)}</div>
    <input ref={ref} className="input" placeholder={t('Your name')} maxLength={40} value={name} onChange={e => setName(e.target.value)} />
    {inviteOnly && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only — enter the code you were given.')}</div>
    </>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go}>{t('Create passkey')}</Button>
  </>
}

// A rising row of bars: the whole promise of the app — a bit better each week — in one shape.
const Bars = () => <div className="wl-bars" aria-hidden="true">
  {[40, 56, 52, 74, 70, 92, 120].map((h, i) => <i key={i} style={{ height: h }} className={i === 5 ? 'ink' : i === 6 ? 'sig' : ''} />)}
</div>

export default function Login() {
  const { setUser, pullState, setGuest } = useStore()
  const signIn = async () => {
    try { const u = await passkeyLogin(); setUser(u); await pullState(); useUI.getState().toast(t('Welcome back, {0}', u.name)) }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Sign-in failed')) }
  }
  const brand = <div className="wl-brand">{APP_NAME}<span>.</span></div>
  const pitch = <div className="wl-mid">
    <Bars />
    <h1 className="wl-h">{t('Your plan.')}<br />{t('Your time.')}<br /><span>{t('A little better every week.')}</span></h1>
    <p className="wl-p">{t('Tell it how many days and how much time you have: you get a realistic program and guidance set by set.')}</p>
  </div>

  // Demo build: no backend to sign in against — the only way in is the local guest profile.
  if (DEMO) return (
    <div className="welcome">
      {brand}
      {pitch}
      <div className="wl-acts">
        <button className="wl-btn ink" onClick={() => setGuest(true)}>{t('Start the demo')}</button>
        <div className="wl-note">{t('This demo runs entirely in your browser on example data — nothing is sent anywhere. Passkey sign-in and sync across your devices come with the openGym server, which you get by self-hosting it.')}</div>
        <a className="wl-note" href={REPO} target="_blank" rel="noopener">{t('Self-host it in a minute →')}</a>
      </div>
    </div>
  )

  return (
    <div className="welcome">
      {brand}
      {pitch}
      <div className="wl-acts">
        {webauthnOK() ? <>
          <button className="wl-btn ink" onClick={() => useUI.getState().openSheet(close => <RegisterSheet close={close} />)}>{t('Create new profile')}</button>
          <button className="wl-btn" onClick={signIn}><Icon name="person" />{t('Sign in with passkey')}</button>
        </> : <div className="wl-note">{t("This browser doesn't support passkeys — you can still use openGym locally on this device.")}</div>}
        <button className="wl-link" onClick={() => setGuest(true)}>{t('Continue without account')}</button>
        <div className="wl-note">{t('Passkeys use {0} — no passwords.', BIO)} {t('Your data stays on your server. No ads.')}</div>
      </div>
    </div>
  )
}
