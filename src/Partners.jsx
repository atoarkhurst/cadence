import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { createInvitation } from './lib/cadence.js'
import { appUrl } from './lib/paths.js'
import PartnerInvitations from './PartnerInvitations.jsx'
import './Partnerships.css'

export function OutgoingInvitations({ userId, refreshKey = 0, partnershipId = null }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const load = useCallback(async () => {
    let query = supabase
      .from('invitations')
      .select('token,email,expires_at,partnership_id,accepted_at')
      .eq('invited_by', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
    if (partnershipId) query = query.eq('partnership_id', partnershipId)
    const result = await query
    if (result.error) throw result.error
    return result.data
  }, [userId, partnershipId])
  useEffect(() => {
    let active = true
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const data = await load()
        if (active) {
          setItems(data)
          setError('')
        }
      } catch {
        if (active) setError('Couldn’t load your sent invitations. Please refresh and try again.')
      }
    }
    void refresh()
    const timer = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [load, refreshKey])
  async function cancel(token) {
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.rpc('cancel_partner_invitation', { invitation_token: token })
      if (error) throw error
      setItems(await load())
      setConfirm(null)
      setStatus('Invitation cancelled. That link can no longer be accepted.')
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }
  async function share(item, copy = false) {
    const url = appUrl(`/invite/${item.token}`)
    try {
      if (!copy && navigator.share)
        await navigator.share({
          title: 'Join me on Cadence',
          text: 'Let’s make a little progress together.',
          url,
        })
      else {
        await navigator.clipboard.writeText(url)
        setStatus('Link copied. Paste it into a message to your partner.')
      }
    } catch (problem) {
      if (problem.name !== 'AbortError')
        setStatus('Select the invitation link to copy it manually.')
    }
  }
  return (
    <section aria-label="Sent invitations">
      {items.map((item) =>
        item.accepted_at ? (
          <article className="outgoing-invitation" key={item.token}>
            <strong>Invitation accepted · {item.email}</strong>
            <p>You’re connected. Your other partnerships haven’t changed.</p>
            <Link to={`/week?partnership=${item.partnership_id}`}>Open your new partnership →</Link>
          </article>
        ) : (
          <article className="outgoing-invitation" key={item.token}>
            <strong>Invitation pending · {item.email}</strong>
            <p>
              No email was sent. Share this link, or ask them to open Invitations in Cadence while
              signed in with this email.
            </p>
            <input
              aria-label={`Invitation link for ${item.email}`}
              readOnly
              value={appUrl(`/invite/${item.token}`)}
              onFocus={(event) => event.target.select()}
            />
            <p>Expires {new Date(item.expires_at).toLocaleDateString()}.</p>
            <div className="invitation-actions">
              <button className="invitation-primary" onClick={() => share(item)}>
                Share invitation
              </button>
              <button onClick={() => share(item, true)}>Copy link</button>
              <button disabled={busy} onClick={() => setConfirm(item.token)}>
                Cancel invitation…
              </button>
            </div>
            {confirm === item.token && (
              <div>
                <p>
                  Cancel this invitation? Their link will stop working. Your goals won’t change.
                </p>
                <div className="invitation-actions">
                  <button disabled={busy} onClick={() => cancel(item.token)}>
                    Yes, cancel invitation
                  </button>
                  <button disabled={busy} onClick={() => setConfirm(null)}>
                    Keep invitation
                  </button>
                </div>
              </div>
            )}
          </article>
        ),
      )}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
    </section>
  )
}

export default function Partners() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(0)
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (active) {
          setUser(data?.user)
          setReady(true)
          if (error) setError('Please sign in to manage invitations.')
        }
      })
      .catch(() => {
        if (active) {
          setError('Couldn’t check your account. Please refresh.')
          setReady(true)
        }
      })
    return () => {
      active = false
    }
  }, [])
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await createInvitation(null, user.id, email)
      setEmail('')
      setCreated((n) => n + 1)
    } catch (problem) {
      setError(
        problem.code === 'PGRST202'
          ? 'Invitations need the latest database update before they can be used.'
          : problem.message,
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="partners-shell">
      <Link to="/week">← Back to your plan</Link>
      <h1>Your partnerships</h1>
      <p>One account. A separate, private plan with each person.</p>
      {!ready ? (
        <p role="status">Checking your account…</p>
      ) : !user ? (
        <Link to="/signin">Sign in to manage invitations</Link>
      ) : (
        <>
          <PartnerInvitations user={user} onAccepted={() => navigate('/week')} />
          <form className="partner-invite-form" onSubmit={submit}>
            <h2>Add a partner</h2>
            <p>
              Your existing goals, history, and partnerships stay unchanged. Only the two of you
              will see the new plan.
            </p>
            <label htmlFor="partner-email">Their email address</label>
            <input
              id="partner-email"
              type="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="partner@example.com"
              disabled={busy}
            />
            <div className="invitation-actions">
              <button className="invitation-primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create invitation'}
              </button>
            </div>
            <p>You’ll get a link to share. This does not send an email.</p>
          </form>
          {created > 0 && <p role="status">Invitation ready. Share the link below.</p>}
          <OutgoingInvitations userId={user.id} refreshKey={created} />
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
