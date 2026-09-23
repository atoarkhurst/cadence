import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { appPath, appUrl } from './lib/paths.js'
import './Auth.css'

function Auth() {
  const [email, setEmail] = useState('')
  const [session, setSession] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  async function signIn(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: appUrl('/signin') },
    })
    setMessage(error ? error.message : 'Check your inbox for your Cadence sign-in link.')
    setLoading(false)
  }

  if (session) return <main className="auth-shell"><section className="auth-card"><span className="auth-kicker">You’re signed in</span><h1>Welcome to Cadence.</h1><p>{session.user.email}</p><a className="auth-primary" href={appPath('/week')}>Continue to your week</a><button className="auth-secondary" onClick={() => supabase.auth.signOut()}>Sign out</button></section></main>

  return <main className="auth-shell"><section className="auth-card"><span className="auth-kicker">Your week, shared</span><h1>Sign in to Cadence.</h1><p>We’ll email you a secure link. No password to remember.</p><form onSubmit={signIn}><label htmlFor="email">Email address</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required/><button className="auth-primary" disabled={loading}>{loading ? 'Please wait…' : 'Email me a sign-in link'}</button></form>{message && <div className="auth-message" role="status">{message}</div>}<small>By continuing, you agree to keep showing up for yourself—and your person.</small></section></main>
}

export default Auth
