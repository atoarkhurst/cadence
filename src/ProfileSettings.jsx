import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { cleanDisplayName } from './lib/profile.js'

export default function ProfileSettings({ userId }) {
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const { data, error } = await supabase.from('profiles').select('display_name').eq('id', userId).single()
        if (error) throw error
        if (active) {
          setName(data.display_name || '')
          setSavedName(data.display_name || '')
          setReady(true)
        }
      } catch {
        if (active) setError('We couldn’t load your name. Please try again.')
      } finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [userId, attempt])

  async function save(event) {
    event.preventDefault()
    if (saving || !ready) return
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const nextName = cleanDisplayName(name)
      const { data, error } = await supabase.from('profiles').update({ display_name: nextName }).eq('id', userId).select('display_name').single()
      if (error) throw error
      setName(data.display_name)
      setSavedName(data.display_name)
      setMessage('Name saved. Your partner will see this name, too.')
    } catch (e) { setError(e.message || 'We couldn’t save your name. Please try again.') }
    finally { setSaving(false) }
  }

  return <section className="profile-settings" aria-labelledby="profile-heading">
    <h2 id="profile-heading">What should we call you?</h2>
    <p>A first name or nickname is perfect. This appears in your greetings, shared progress, and chat.</p>
    {loading ? <p role="status">Loading your name…</p> : ready ? <form onSubmit={save}>
      <label htmlFor="display-name">Your name</label>
      <input id="display-name" name="name" autoComplete="nickname" placeholder="e.g. Ato" maxLength={60} required disabled={saving} value={name} onChange={event => { setName(event.target.value); setMessage(''); setError('') }}/>
      <button className="auth-primary" disabled={saving || !name.trim() || name.trim() === savedName}>{saving ? 'Saving…' : 'Save name'}</button>
    </form> : <button className="auth-secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button>}
    {error && <p className="profile-error" role="alert">{error}</p>}
    {message && <p className="auth-message" role="status">{message}</p>}
  </section>
}
