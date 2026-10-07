import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { appUrl } from './lib/paths.js'
import './Auth.css'
import './Account.css'
import WeekSchedule from './WeekSchedule.jsx'
import ProfileSettings from './ProfileSettings.jsx'
import PartnerConnection from './PartnerConnection.jsx'
import NotificationSettings from './NotificationSettings.jsx'
import { disablePush } from './lib/push.js'
import { activePartnership, validId } from './lib/active-partnership.js'
import { getPendingInvite, rememberPendingInvite } from './lib/pending-invite.js'

const sections = [
  { id: 'profile', label: 'Profile', detail: 'How you show up' },
  { id: 'partnership', label: 'Partner & week', detail: 'Your shared rhythm' },
  { id: 'notifications', label: 'Notifications', detail: 'A little encouragement' },
  { id: 'security', label: 'Sign-in & password', detail: 'Access to your account' },
]

export default function Auth() {
  const selectedPartnership = useSyncExternalStore(
    activePartnership.subscribe,
    activePartnership.get,
  )
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [session, setSession] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(params.get('reset') === 'password' ? 'reset' : 'password')
  const [recovery, setRecovery] = useState(params.get('reset') === 'password')
  const [sent, setSent] = useState(false)
  const requestedSection =
    params.get('section') ||
    (window.location.hash === '#notifications' ? 'notifications' : 'profile')
  const section = recovery
    ? 'security'
    : sections.some((item) => item.id === requestedSection)
      ? requestedSection
      : 'profile'
  const pending = params.get('invite') || getPendingInvite()
  const invitation = validId(pending) ? pending : null

  useEffect(() => {
    let active = true
    if (invitation) rememberPendingInvite(invitation)
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        setSession(data.session)
        if (error) setError(error.message)
        setInitializing(false)
      })
      .catch(() => {
        if (active) {
          setError('We couldn’t check your account. Please reload and try again.')
          setInitializing(false)
        }
      })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true)
        setParams(
          (previous) => {
            const next = new URLSearchParams(previous)
            next.set('reset', 'password')
            return next
          },
          { replace: true },
        )
      }
      setInitializing(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [invitation, setParams])

  useEffect(() => {
    // Only an explicit invitation sign-in redirects automatically. Visiting
    // Account normally must not loop back to an old invitation in storage.
    if (session && params.get('invite') && invitation && !recovery && params.get('switch') !== '1')
      navigate(`/invite/${invitation}`, { replace: true })
  }, [session, params, invitation, recovery, navigate])

  function changeMode(next) {
    setMode(next)
    setMessage('')
    setError('')
    setPassword('')
    setConfirmation('')
    setSent(false)
  }
  function selectSection(id) {
    const next = new URLSearchParams(params)
    next.set('section', id)
    next.delete('reset')
    setRecovery(false)
    setParams(next)
    setMessage('')
    setError('')
  }
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setMessage('')
    setError('')
    if (session && password !== confirmation) {
      setError('Those passwords don’t match. Please try again.')
      return
    }
    setBusy(true)
    try {
      let result
      if (session) result = await supabase.auth.updateUser({ password })
      else if (mode === 'password')
        result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      else if (mode === 'reset')
        result = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: appUrl('/signin'),
        })
      else
        result = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: appUrl('/signin' + (invitation ? '?invite=' + invitation : '')),
          },
        })
      if (result.error) throw result.error
      setPassword('')
      setConfirmation('')
      if (session) {
        if (recovery) selectSection('security')
        setMessage('Password saved. You can use it the next time you sign in.')
      } else if (mode !== 'password') setSent(true)
    } catch (problem) {
      setError(
        /rate.limit/i.test(problem.message)
          ? 'We’ve reached the email sending limit. Please try again later, or sign in with your password.'
          : problem.message,
      )
    } finally {
      setBusy(false)
    }
  }
  async function signOut() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await disablePush()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setRecovery(false)
      setPassword('')
      setConfirmation('')
      setSent(false)
      setMode('password')
      setParams(invitation ? { invite: invitation } : {})
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  const feedback = (
    <>
      {error && (
        <p className="account-feedback account-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="account-feedback" role="status">
          {message}
        </p>
      )}
    </>
  )
  if (initializing)
    return (
      <main className="account-shell">
        <p role="status">Opening your account…</p>
      </main>
    )
  if (session)
    return (
      <main className="account-shell">
        {params.get('switch') === '1' && invitation && (
          <section className="account-feedback" aria-label="Switch invitation account">
            <p>
              Signed in as {session.user.email}. To accept with a different email, sign out first.
              Your invitation will be kept.
            </p>
            <button className="auth-secondary" disabled={busy} onClick={signOut}>
              Sign out and use invited email
            </button>
          </section>
        )}
        <header className="account-header">
          <div>
            <p className="account-eyebrow">Settings</p>
            <h1>Your account</h1>
            <p>Manage your profile, shared week, and notifications.</p>
          </div>
          <Link className="account-week-link" to={invitation ? '/invite/' + invitation : '/week'}>
            {invitation ? 'Continue invitation' : 'Back to your week'}{' '}
            <span aria-hidden="true">↗</span>
          </Link>
        </header>
        <div className="account-layout">
          <aside className="account-sidebar">
            <div className="account-identity">
              <span className="account-monogram" aria-hidden="true">
                c
              </span>
              <div>
                <strong>Your space</strong>
                <span>{session.user.email}</span>
              </div>
            </div>
            <nav className="account-nav" aria-label="Account settings">
              {sections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={section === item.id ? 'page' : undefined}
                  onClick={() => selectSection(item.id)}
                >
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </button>
              ))}
            </nav>
            <button className="account-signout" disabled={busy} onClick={signOut}>
              {busy ? 'Please wait…' : 'Sign out'} <span aria-hidden="true">↗</span>
            </button>
          </aside>
          <div className="account-content auth-card">
            <div hidden={section !== 'profile'}>
              <p className="account-eyebrow">01 / Profile</p>
              <ProfileSettings key={'profile-' + session.user.id} userId={session.user.id} />
            </div>
            <div hidden={section !== 'partnership'}>
              <p className="account-eyebrow">02 / Partner & week</p>
              <PartnerConnection
                key={`${session.user.id}:${selectedPartnership}`}
                userId={session.user.id}
              />
              <WeekSchedule key={`schedule:${session.user.id}:${selectedPartnership}`} />
            </div>
            <div hidden={section !== 'notifications'}>
              <p className="account-eyebrow">03 / Notifications</p>
              <NotificationSettings
                key={'notifications-' + session.user.id}
                userId={session.user.id}
              />
            </div>
            <div hidden={section !== 'security'}>
              <p className="account-eyebrow">04 / Sign-in & password</p>
              <section className="account-security" aria-labelledby="security-heading">
                <h2 id="security-heading">
                  {recovery ? 'Choose a new password.' : 'An easier way back in.'}
                </h2>
                <p>
                  {recovery
                    ? 'Save a new password below, then head back to your week.'
                    : 'Set a password to sign in without waiting for an email. You can change it here anytime.'}
                </p>
                <form onSubmit={submit}>
                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={busy}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby="password-hint"
                  />
                  <small id="password-hint" className="account-field-hint">
                    Use at least 8 characters.
                  </small>
                  <label htmlFor="confirm-password">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={busy}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                  <button className="auth-primary" disabled={busy || !password || !confirmation}>
                    {busy ? 'Saving…' : 'Save password'}
                  </button>
                </form>
              </section>
            </div>
            {feedback}
          </div>
        </div>
        <p className="account-footer">Small intentions. A little support. Your own cadence.</p>
      </main>
    )
  return (
    <main className="auth-shell signin-shell">
      <section className="auth-card signin-card">
        <span className="auth-kicker">Your week, shared</span>
        <h1>
          {sent
            ? 'Check your inbox.'
            : mode === 'reset'
              ? 'Forgot your password?'
              : mode === 'link'
                ? 'Your week starts here.'
                : 'Welcome back.'}
        </h1>
        {sent ? (
          <>
            <p>
              {mode === 'reset'
                ? 'If an account exists for this email, you’ll receive a link to choose a new password.'
                : 'Check your email to continue. If you’re new to Cadence, confirm your address to finish setting up your account. If you’ve been here before, use the sign-in link.'}
            </p>
            <p className="signin-email">{email.trim()}</p>
            <p>
              Look for an email with a confirmation or sign-in link. Check spam if it hasn’t arrived
              after a few minutes.
            </p>
            <button className="auth-secondary" onClick={() => changeMode('password')}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <p>
              {mode === 'reset'
                ? 'Enter your account email and we’ll send you a password reset link.'
                : mode === 'link'
                  ? 'New here? We’ll send a link to confirm your email. Returning? The link signs you in.'
                  : 'A few intentions. Someone in your corner.'}
            </p>
            {recovery && (
              <p className="account-feedback">
                Open the reset link from your email to choose a new password. If it expired, request
                another below.
              </p>
            )}
            <form onSubmit={submit}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                disabled={busy}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              {mode === 'password' && (
                <>
                  <div className="signin-label-row">
                    <label htmlFor="password">Password</label>
                    <button
                      type="button"
                      className="auth-text-button"
                      disabled={busy}
                      onClick={() => changeMode('reset')}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={busy}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </>
              )}
              <button className="auth-primary" disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : mode === 'password'
                    ? 'Sign in'
                    : mode === 'reset'
                      ? 'Send reset link'
                      : 'Send sign-in link'}
              </button>
            </form>
            <div className="signin-alternative">
              <button
                className="auth-secondary"
                disabled={busy}
                onClick={() => changeMode(mode === 'password' ? 'link' : 'password')}
              >
                {mode === 'password' ? 'New here? Start with an email link' : 'Back to sign in'}
              </button>
              {mode === 'password' && (
                <button
                  className="auth-text-button"
                  disabled={busy}
                  onClick={() => changeMode('link')}
                >
                  Or sign in without a password
                </button>
              )}
            </div>
          </>
        )}
        {feedback}
      </section>
      <p className="signin-footnote">A little progress feels better together.</p>
    </main>
  )
}
