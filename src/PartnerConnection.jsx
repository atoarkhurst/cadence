import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { choosePartnership } from './lib/partnership.js'
import { appPath } from './lib/paths.js'

export default function PartnerConnection({ userId }) {
  const [connection, setConnection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [disconnected, setDisconnected] = useState(false)
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data, error } = await supabase.from('partnership_members').select('partnership_id,user_id')
        if (error) throw error
        const own = choosePartnership(data, userId)
        const partner = data.find(m => m.partnership_id === own?.partnership_id && m.user_id !== userId)
        let name = 'your partner'
        if (partner) {
          const result = await supabase.from('profiles').select('display_name').eq('id', partner.user_id).single()
          if (result.error) throw result.error
          name = result.data.display_name || name
        }
        if (active) setConnection(partner ? { id: own.partnership_id, name } : null)
      } catch (e) { if (active) setError(e.message) }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [userId])

  async function disconnect() {
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.rpc('disconnect_partner', { target_partnership: connection.id })
      if (error) throw error
      localStorage.removeItem('cadence-pending-invite')
      setConnection(null)
      setConfirming(false)
      setDisconnected(true)
    } catch (e) {
      setError(e.code === 'PGRST202' ? 'Partner disconnection needs the latest database setup. Apply the disconnect migration, then try again.' : e.message)
    } finally { setBusy(false) }
  }

  return <section className="partner-settings" aria-labelledby="partner-heading">
    <h2 id="partner-heading">Your partner</h2>
    {loading ? <p>Loading your connection…</p> : connection ? <>
      <p>Connected with <strong>{connection.name}</strong>.</p>
      {confirming ? <div className="disconnect-confirm">
        <h3>Disconnect from {connection.name}?</h3>
        <p>Both of you keep your own goals and progress, including past weeks. You’ll stop seeing each other’s updates.</p>
        <p>Shared messages and weekly reflections will no longer be accessible in the app. They won’t be shared with your next partner. Old invitation links will stop working.</p>
        <p>You can invite someone new, or reconnect later with a new invitation.</p>
        <button className="auth-primary" disabled={busy} onClick={() => setConfirming(false)}>Stay connected</button>
        <button className="disconnect-button" disabled={busy} onClick={disconnect}>{busy ? 'Disconnecting…' : 'Disconnect partner'}</button>
      </div> : <button className="auth-secondary" onClick={() => setConfirming(true)}>Disconnect partner…</button>}
    </> : !error && <>
      <p role="status">{disconnected ? 'You’re disconnected. Your goals and progress are still yours.' : 'No partner connected yet.'}</p>
      <a href={appPath('/week')}>Invite a partner from your week →</a>
    </>}
    {error && <p role="alert" className="connection-error">{error}</p>}
  </section>
}
