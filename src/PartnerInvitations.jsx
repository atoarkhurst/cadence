import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { acceptInvitation } from './lib/cadence.js'

export default function PartnerInvitations({ user, onAccepted }) {
  const [invites, setInvites] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    async function refresh() {
      const { data, error } = await supabase.from('invitations').select('token, invited_by').eq('email', user.email.toLowerCase()).is('accepted_at', null).gt('expires_at', new Date().toISOString())
      if (!active) return
      if (error) { setMessage(error.message); return }
      const ids = [...new Set(data.map((item) => item.invited_by))]
      const profiles = ids.length ? await supabase.from('profiles').select('id, display_name').in('id', ids) : { data: [] }
      if (active) setInvites(data.map((item) => ({ ...item, name: profiles.data?.find((profile) => profile.id === item.invited_by)?.display_name || 'Your partner' })))
    }
    refresh()
    const timer = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [user.id, user.email])
  async function accept(token) {
    setBusy(true)
    try { await acceptInvitation(token); await onAccepted() }
    catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <>{invites.map((invite) => <div className="cheer-card" key={invite.token}><p><strong>{invite.name} invited you</strong><small>Share your weekly intentions and progress.</small><button disabled={busy} onClick={() => accept(invite.token)}>{busy ? 'Connecting…' : 'Accept invitation'}</button></p></div>)}{message && <p role="alert">{message}</p>}</>
}
