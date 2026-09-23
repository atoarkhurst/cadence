import { useEffect, useState } from 'react'
import { createDailyItem, loadDailyRhythm, removeDailyItem, setDailyCompletion } from './lib/cadence.js'
import { appPath } from './lib/paths.js'
import './App.css'

function App() {
  const [items, setItems] = useState([])
  const [user, setUser] = useState(null)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    loadDailyRhythm().then((data) => {
      if (data.signedOut) return setStatus('signed-out')
      setUser(data.user)
      setItems(data.items)
      setStatus('ready')
    }).catch((nextError) => { setError(nextError.message); setStatus('error') })
  }, [])

  async function toggle(item) {
    const done = !item.done
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done } : entry))
    await setDailyCompletion(item.id, user.id, done)
  }

  async function addItem(event) {
    event.preventDefault()
    const name = input.trim()
    if (!name) return
    const id = await createDailyItem(user.id, name)
    setItems((current) => [...current, { id, name, done: false }])
    setInput('')
  }

  async function deleteItem(id) {
    setItems((current) => current.filter((item) => item.id !== id))
    await removeDailyItem(id)
  }

  if (status === 'loading') return <main className="daily-shell"><p>Loading your day…</p></main>
  if (status === 'signed-out') return <main className="daily-shell"><h1>Sign in to see your day.</h1><a href={appPath('/signin')}>Sign in</a></main>
  if (status === 'error') return <main className="daily-shell"><h1>We couldn’t load your day.</h1><p>{error}</p></main>

  const completed = items.filter((item) => item.done).length
  const percent = items.length ? Math.round(completed / items.length * 100) : 0
  const name = user.email?.split('@')[0] ?? 'there'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return <main className="daily-shell">
    <header className="daily-header"><div><p className="daily-date">{today}</p><h1>Good morning, {name}.</h1><p>Small progress is still progress. Here’s what matters today.</p></div><div className="day-progress" style={{ '--progress': `${percent * 3.6}deg` }}><span>{percent}%</span></div></header>
    <div className="daily-grid"><section className="today-card"><div className="card-heading"><div><span>Today</span><h2>Your daily rhythm</h2></div><strong>{completed} of {items.length}</strong></div>
      {items.length === 0 && <p className="hero-copy">Add one small thing you want to complete today.</p>}
      <ul className="habit-list">{items.map((item) => <li key={item.id} className={`habit-item ${item.done ? 'done' : ''}`}><label><input type="checkbox" checked={item.done} onChange={() => toggle(item)}/><span className="habit-name">{item.name}</span></label><button className="delete-btn" onClick={() => deleteItem(item.id)} aria-label={`Delete ${item.name}`}>×</button></li>)}</ul>
      <form className="add-habit-form" onSubmit={addItem}><input className="add-habit-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Add something for today"/><button className="add-habit-btn">Add</button></form>
    </section><aside className="daily-side"><section className="streak-card"><span className="side-label">Today’s cadence</span><div className="streak-value">{completed}<small>complete</small></div><p>Your rhythm resets each day while your history stays saved.</p></section><section className="partner-note"><div className="partner-note-top"><div><strong>Shared encouragement</strong><small>Connected to your partnership</small></div></div><p>Real partner check-ins and cheers will appear here as they happen.</p><a href={appPath('/week')}>Open the shared week</a></section></aside></div>
    <section className="weekly-focus"><div><span className="side-label">This week’s focus</span><h2>Build momentum, not pressure.</h2></div><a href={appPath('/week')}>View the week <span>→</span></a></section>
  </main>
}

export default App
