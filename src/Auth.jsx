import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { appPath, appUrl } from './lib/paths.js'
import './Auth.css'
import PartnerConnection from './PartnerConnection.jsx'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('password')
  const pending = new URLSearchParams(window.location.search).get('invite') || localStorage.getItem('cadence-pending-invite')
  const invitation = /^[0-9a-f-]{36}$/i.test(pending || '') ? pending : null
  useEffect(() => {
    if (invitation) localStorage.setItem('cadence-pending-invite', invitation)
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session)
      if (error) setMessage(error.message)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    return () => data.subscription.unsubscribe()
  }, [invitation])
  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const result = session
        ? await supabase.auth.updateUser({ password })
        : mode === 'password'
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
          : await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: appUrl('/signin' + (invitation ? '?invite=' + invitation : '')) } })
      if (result.error) throw result.error
      setPassword('')
      setMessage(session ? 'Password saved. Next time you can sign in without an email.' : mode === 'link' ? 'Check your inbox. Open the link in this browser.' : 'Signed in.')
    } catch (error) { setMessage(error.message) }
    finally { setLoading(false) }
  }
  return <main className="auth-shell"><section className="auth-card"><span className="auth-kicker">Your week, shared</span><h1>{session ? 'Your account.' : 'Sign in to Cadence.'}</h1>{session ? <><p>{session.user.email}</p><a className="auth-primary" href={appPath(invitation ? '/invite/' + invitation : '/week')}>{invitation ? 'Continue to your invitation' : 'Open your week'}</a><PartnerConnection key={session.user.id} userId={session.user.id}/><form onSubmit={submit}><label htmlFor="password">Set or change your password</label><input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)}/><button className="auth-primary" disabled={loading}>Save password</button></form><button className="auth-secondary" onClick={async () => { const { error } = await supabase.auth.signOut(); setMessage(error?.message || '') }}>Sign out</button></> : <><p>{mode === 'password' ? 'Use your existing account’s password. First time here? Request an email link below.' : 'We’ll send a secure sign-in link. After signing in, you can set a password.'}</p><form onSubmit={submit}><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}/>{mode === 'password' && <><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)}/></>}<button className="auth-primary" disabled={loading}>{loading ? 'Please wait…' : mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}</button></form><button className="auth-secondary" onClick={() => { setMode(mode === 'password' ? 'link' : 'password'); setMessage('') }}>{mode === 'password' ? 'First time or no password? Use an email link' : 'Use my password'}</button></>}{message && <p className="auth-message" role="status">{message}</p>}</section></main>
}
