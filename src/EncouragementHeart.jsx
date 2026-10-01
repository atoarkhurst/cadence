import { useRef, useState } from 'react'
import { setEncouragementHeart } from './lib/cadence.js'

export default function EncouragementHeart({ noteId, hearted, onChanged }) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function acknowledge() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await setEncouragementHeart(noteId, !hearted)
      await onChanged()
    } catch {
      setError('Couldn’t save your heart. Please try again.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <div className="note-heart-control">
      <button
        className="note-heart"
        aria-pressed={hearted}
        disabled={busy}
        aria-label={hearted ? 'Remove heart' : 'Send a heart'}
        onClick={acknowledge}
      >
        <span aria-hidden="true">{hearted ? '♥' : '♡'}</span>
        {busy ? 'Saving…' : hearted ? 'Appreciated' : 'Send a heart'}
      </button>
      {error && <small role="status">{error}</small>}
    </div>
  )
}
