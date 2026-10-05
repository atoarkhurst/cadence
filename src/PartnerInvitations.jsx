import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { acceptInvitation } from './lib/cadence.js'
import { weekStore } from './lib/week-store.js'

export default function PartnerInvitations({ user, onAccepted }) {
  const [invites, setInvites] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let active = true
    let running = false
    async function refresh() {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        const { data, error } = await supabase.rpc('pending_invitations')
        if (error) throw error
        if (!active) return
        if (active) {
          setInvites(data.map((item) => ({ ...item, name: item.name || 'Your partner' })))
          setMessage('')
        }
      } catch {
        if (active)
          setMessage(
            'We couldn’t check your invitations. Please try again, or open the link your partner shared.',
          )
      } finally {
        running = false
        if (active) setChecking(false)
      }
    }
    refresh()
    const timer = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [user.id, user.email, refreshKey])
  async function accept(token) {
    setBusy(true)
    setMessage('')
    try {
      await acceptInvitation(token)
      weekStore.invalidate()
      if (localStorage.getItem('cadence-pending-invite') === token)
        localStorage.removeItem('cadence-pending-invite')
      setInvites((items) => items.filter((item) => item.token !== token))
      await onAccepted()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="invitation-check" aria-label="Received invitations">
      <p className="encouragement-hint">Signed in as {user.email}</p>
      <button
        className="partner-refresh"
        disabled={busy || checking}
        onClick={() => {
          setChecking(true)
          setRefreshKey((value) => value + 1)
        }}
      >
        {checking ? 'Checking invitations…' : 'Check invitations'}
      </button>
      {!invites.length && !message && (
        <p className="encouragement-hint" role="status">
          {checking
            ? 'Looking for an invitation to this account…'
            : 'No pending invitations for this email.'}
        </p>
      )}
      {invites.map((invite) => (
        <div className="cheer-card" key={invite.token}>
          <p>
            <strong>{invite.name} invited you</strong>
            <small>Connect to see each other’s goals and send encouragement.</small>
            <button disabled={busy} onClick={() => accept(invite.token)}>
              {busy ? 'Connecting…' : 'Accept invitation'}
            </button>
          </p>
        </div>
      ))}
      {message && <p role="alert">{message}</p>}
    </section>
  )
}
