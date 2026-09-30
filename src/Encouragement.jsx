import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useEncouragement } from './lib/encouragement-context.js'
import EncouragementNote from './EncouragementNote.jsx'

export default function Encouragement() {
  const { items, status, refresh, hasMore, more } = useEncouragement()
  const requested = new URLSearchParams(window.location.search).get('message')
  const target = items.find(note => note.id === requested)?.id
  useEffect(() => {
    if (target) document.getElementById(`note-${target}`)?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [target])
  return <main className="encouragement-shell">
    <p className="eyebrow">In your corner</p><h1>Encouragement for you.</h1>
    <p className="encouragement-intro">A place for the notes that keep you going.</p>
    {status === 'loading' && <p role="status">Loading your notes…</p>}
    {status === 'signed-out' && <p><Link to="/signin">Sign in</Link> to read your encouragement. Then open the note icon at the top.</p>}
    {status === 'not-ready' && <p>The new encouragement inbox is being set up. Your existing notes are still beneath your goals in <Link to="/week">This week</Link>.</p>}
    {status === 'error' && <p role="alert">Couldn’t refresh your notes. <button onClick={refresh}>Try again</button></p>}
    {status === 'ready' && !items.length && <div className="encouragement-empty"><h2>A little support goes a long way.</h2><p>New notes from your partner will appear here and beneath your weekly goals. Older notes stay in their original weeks.</p><Link to="/week">Open your week →</Link></div>}
    {items.map(note => <EncouragementNote key={note.id} notification={note} author={note.profiles?.display_name} message={note.encouragements?.message || 'This note is no longer available.'}>
      <div className="note-meta"><time dateTime={note.created_at}>{new Date(note.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
      {note.weeks && <Link to={`/week?week=${note.weeks.starts_on}#received-encouragement`}>View this week</Link>}</div>
    </EncouragementNote>)}
    {hasMore && <button className="note-read" onClick={more}>Load older notes</button>}
    <p className="encouragement-preferences"><Link to="/signin#notifications">Manage optional phone notifications</Link></p>
  </main>
}
