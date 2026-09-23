import { useEffect, useState } from 'react'
import { createIntention, loadCurrentWeek, setProgress } from './lib/cadence.js'
import { appPath } from './lib/paths.js'
import './App.css'

function App() {
  const [workspace, setWorkspace] = useState(null)
  const [tasks, setTasks] = useState([])
  const [goals, setGoals] = useState([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    loadCurrentWeek().then((data) => {
      if (data.signedOut) return setStatus('signed-out')
      setWorkspace(data)
      setTasks(data.tasks)
      setGoals(data.goals)
      setStatus('ready')
    }).catch((nextError) => { setError(nextError.message); setStatus('error') })
  }, [])

  async function toggleTask(task) {
    const done = !task.done
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done } : item))
    await setProgress(task.id, workspace.user.id, done ? 1 : 0)
  }

  async function addIntention(event) {
    event.preventDefault()
    const name = input.trim()
    if (!name) return
    const id = await createIntention(workspace.weekId, workspace.user.id, name, 'one_time')
    setTasks((current) => [...current, { id, name, done: false, kind: 'one_time' }])
    setInput('')
  }

  async function adjustGoal(goal, change) {
    const count = Math.max(0, goal.count + change)
    setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, count } : item))
    await setProgress(goal.id, workspace.user.id, count)
  }

  if (status === 'loading') return <main className="daily-shell"><p>Loading your day…</p></main>
  if (status === 'signed-out') return <main className="daily-shell"><h1>Sign in to see your day.</h1><a href={appPath('/signin')}>Sign in</a></main>
  if (status === 'error') return <main className="daily-shell"><h1>We couldn’t load your day.</h1><p>{error}</p></main>

  const completed = tasks.filter((item) => item.done).length + goals.filter((item) => item.count >= item.target).length
  const total = tasks.length + goals.length
  const percent = total ? Math.round(completed / total * 100) : 0
  const name = workspace.user.email?.split('@')[0] ?? 'there'
  const partnerCompleted = workspace.partnerItems.filter((item) => item.done || item.count >= item.target).length
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return <main className="daily-shell">
    <header className="daily-header"><div><p className="daily-date">{today}</p><h1>Good morning, {name}.</h1><p>One small step is enough. Move this week forward.</p></div><div className="day-progress" style={{ '--progress': `${percent * 3.6}deg` }}><span>{percent}%</span></div></header>
    <div className="daily-grid"><section className="today-card"><div className="card-heading"><div><span>Your week, today</span><h2>What can you move forward?</h2></div><strong>{completed} of {total}</strong></div>
      {total === 0 && <div className="daily-empty"><h3>Start with one achievable intention.</h3><p>Anything you add here also appears on your weekly plan.</p></div>}
      <ul className="habit-list">{tasks.map((task) => <li key={task.id} className={`habit-item ${task.done ? 'done' : ''}`}><label><input type="checkbox" checked={task.done} onChange={() => toggleTask(task)}/><span className="habit-name">{task.name}<small>Finish once</small></span></label></li>)}</ul>
      <div className="daily-rhythms">{goals.map((goal) => <div className={`daily-rhythm ${goal.count >= goal.target ? 'done' : ''}`} key={goal.id}><div><span>{goal.name}</span><small>Build a rhythm · {goal.count} of {goal.target}</small></div><button onClick={() => adjustGoal(goal, -1)} disabled={goal.count === 0}>−</button><button className="progress-add" onClick={() => adjustGoal(goal, 1)}>+1</button></div>)}</div>
      <form className="add-habit-form" onSubmit={addIntention}><input className="add-habit-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Add an intention for this week"/><button className="add-habit-btn">Add</button></form>
      <p className="sync-note">Changes here are reflected on your weekly plan.</p>
    </section><aside className="daily-side"><section className="streak-card"><span className="side-label">This week</span><div className="streak-value">{percent}<small>% complete</small></div><p>Your progress is shared across Daily and Weekly, so there’s only one list to maintain.</p><a className="text-link" href={appPath('/week')}>Review the full week →</a></section><section className="partner-note"><div className="partner-note-top"><div><strong>{workspace.partner ? `${workspace.partner.display_name} is in your corner` : 'Better with a partner'}</strong><small>{workspace.partner ? `${partnerCompleted} of ${workspace.partnerItems.length} complete` : 'Share progress and encouragement'}</small></div></div><p>{workspace.partner ? 'See how their week is moving and leave a quick note of encouragement.' : 'Invite someone you trust to share the weekly ritual with you.'}</p><a href={appPath('/week')}>{workspace.partner ? 'See your shared week' : 'Invite a partner'}</a></section></aside></div>
  </main>
}

export default App
