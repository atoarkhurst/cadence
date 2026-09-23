import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { acceptInvitation } from './lib/cadence.js'
import { supabase } from './lib/supabase.js'
import { appPath } from './lib/paths.js'
import './Auth.css'

export default function Invite() {
  const { token } = useParams()
  const [user, setUser] = useState(null)
  const [busy, setBusy] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const [message, setMessage] = useState('Checking your account…')
  useEffect(() => {
    localStorage.setItem('cadence-pending-invite', token)
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setMessage(data.user ? 'Signed in as ' + data.user.email + '. Accept to share your week.' : 'Sign in with the invited email. Your invitation will be waiting on the Account page.')
      setBusy(false)
    }).catch((error) => { setMessage(error.message); setBusy(false) })
  }, [token])
  async function accept() {
    setBusy(true)
    try {
      await acceptInvitation(token)
      localStorage.removeItem('cadence-pending-invite')
      setAccepted(true)
      setMessage('You’re connected. Open your shared week to see each other’s progress.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <main className="auth-shell"><section className="auth-card"><span className="auth-kicker">Partner invitation</span><h1>{accepted ? 'You’re in it together.' : 'Join a shared week.'}</h1><p role="status">{message}</p>{accepted ? <a className="auth-primary" href={appPath('/week')}>Open shared week</a> : user ? <><button className="auth-primary" disabled={busy} onClick={accept}>{busy ? 'Connecting…' : 'Accept invitation'}</button><a href={appPath('/signin')}>Wrong account? Switch accounts</a></> : !busy && <a className="auth-primary" href={appPath('/signin?invite=' + encodeURIComponent(token))}>Sign in to continue</a>}</section></main>
}
