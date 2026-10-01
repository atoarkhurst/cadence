import { useEffect, useState } from 'react'
import { loadCurrentWeek } from './lib/cadence.js'
import { supabase } from './lib/supabase.js'
import { dayNames, upcomingStart, weekLabel } from './lib/weeks.js'

export default function WeekSchedule() {
  const [workspace, setWorkspace] = useState(null)
  const [day, setDay] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  useEffect(() => {
    let active = true
    loadCurrentWeek()
      .then((data) => {
        if (active && !data.signedOut) {
          setWorkspace(data)
          setDay(data.schedule?.start_day ?? 1)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [])
  const changed = workspace && day !== (workspace.schedule?.start_day ?? 1)
  const begins = upcomingStart(day, workspace?.schedule)
  async function save(event) {
    event.preventDefault()
    if (busy || !changed) return
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const { data, error } = await supabase.rpc('change_week_schedule', {
        target_partnership: workspace.partnershipId,
        new_day: day,
        shared_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (error) throw error
      setWorkspace(await loadCurrentWeek())
      setSaved('Your shared schedule is saved. The new cycle is ' + weekLabel(data) + '.')
    } catch (e) {
      setError(
        e.code === 'PGRST202'
          ? 'Week settings are not available yet. Please ask the app owner to finish the update.'
          : e.message,
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="profile-settings">
      <h2>Your shared week</h2>
      <p>
        Start your goals on the day you meet. Review the previous week, then begin your new plan.
      </p>
      {workspace && (
        <form onSubmit={save}>
          <label htmlFor="week-start">Our week starts on</label>
          <select
            id="week-start"
            value={day}
            disabled={busy}
            onChange={(e) => {
              setDay(Number(e.target.value))
              setSaved('')
            }}
          >
            {dayNames.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
          <p>
            Shared time zone:{' '}
            {workspace.schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          {changed && (
            <div className="schedule-preview">
              <strong>Begin {weekLabel(begins)}</strong>
              <p>
                This applies to both partners. Your upcoming plans move to the new dates with their
                progress intact. Completed reviews and past goals keep their original dates.
              </p>
              <p>
                Both partners must finish the current review first. You only need to apply this
                change once.
              </p>
            </div>
          )}
          <button className="auth-primary" disabled={busy || !changed}>
            {busy ? 'Saving…' : 'Apply shared schedule'}
          </button>
        </form>
      )}
      {saved && (
        <p role="status" className="auth-message">
          {saved}
        </p>
      )}
      {error && (
        <p role="alert" className="profile-error">
          {error}
        </p>
      )}
    </section>
  )
}
