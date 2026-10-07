import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { acceptInvitation } from './lib/cadence.js'
import { supabase } from './lib/supabase.js'
import './Auth.css'
import { weekStore } from './lib/week-store.js'
import { validId } from './lib/active-partnership.js'
import { clearPendingInvite, rememberPendingInvite } from './lib/pending-invite.js'

export default function Invite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [busy, setBusy] = useState(true)
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('Checking your account…')
  useEffect(() => {
    let active = true
    async function load() {
      if (!validId(token))
        throw new Error('This invitation link is incomplete. Ask your partner to share it again.')
      rememberPendingInvite(token)
      const { data, error } = await supabase.auth.getUser()
      if (!active) return
      if (error && error.name !== 'AuthSessionMissingError') throw error
      setUser(data?.user || null)
      if (!data?.user) {
        setMessage(
          'Sign in with the email your partner invited. We’ll bring you straight back here.',
        )
        return
      }
      const result = await supabase.rpc('invitation_details', { invitation_token: token })
      if (!active) return
      if (result.error) throw result.error
      const invitation = result.data?.[0]
      if (!invitation) {
        setMessage(
          `You’re signed in as ${data.user.email}. This invitation may be for a different email, or the connection may have ended.`,
        )
        return
      }
      setDetails(invitation)
      setMessage(
        invitation.accepted
          ? 'You’ve already accepted. Open your partnership to continue.'
          : new Date(invitation.expires_at) <= new Date()
            ? 'This invitation has expired or was cancelled. Ask your partner for a new link.'
            : `Signed in as ${data.user.email}. Accept to start a shared plan together. Your other partnerships and goals won’t change.`,
      )
    }
    load()
      .catch((problem) => {
        if (active)
          setError(
            problem.code === 'PGRST202'
              ? 'Invitations need the latest database update. Please try again after the update.'
              : problem.message,
          )
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [token])
  async function accept() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await acceptInvitation(token)
      weekStore.invalidate()
      clearPendingInvite(token)
      navigate('/week', { replace: true })
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }
  const available = details && (details.accepted || new Date(details.expires_at) > new Date())
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="auth-kicker">Partner invitation</span>
        <h1>{details?.name ? `${details.name} invited you.` : 'A little progress, together.'}</h1>
        <p role="status">{message}</p>
        {error && <p role="alert">{error}</p>}
        {user ? (
          <>
            {available && (
              <button className="auth-primary" disabled={busy} onClick={accept}>
                {busy ? 'Connecting…' : details.accepted ? 'Open partnership' : 'Accept invitation'}
              </button>
            )}
            <Link to={`/signin?invite=${encodeURIComponent(token)}&switch=1`}>
              Use a different account
            </Link>
            <p>
              <Link to="/partners">Back to invitations</Link>
            </p>
          </>
        ) : (
          !busy &&
          validId(token) && (
            <Link className="auth-primary" to={'/signin?invite=' + encodeURIComponent(token)}>
              Sign in to continue
            </Link>
          )
        )}
      </section>
    </main>
  )
}
