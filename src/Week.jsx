import { useEffect, useState } from 'react'
import { encodeSnapshot } from './utils/share.js'
import { createEncouragement, createIntention, createInvitation, loadCurrentWeek, removeIntention, setProgress } from './lib/cadence.js'
import { appPath, appUrl } from './lib/paths.js'
import './Week.css'

function dateRange() {
  const monday = new Date()
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function Week() {
  const [tasks, setTasks] = useState([])
  const [goals, setGoals] = useState([])
  const [workspace, setWorkspace] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [taskInput, setTaskInput] = useState('')
  const [goalInput, setGoalInput] = useState({ name: '', target: '' })
  const [note, setNote] = useState('')
  const [cheers, setCheers] = useState([])
  const [copied, setCopied] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')

  useEffect(() => {
    loadCurrentWeek().then((data) => {
      if (data.signedOut) return setStatus('signed-out')
      setWorkspace(data)
      setTasks(data.tasks)
      setGoals(data.goals)
      setCheers(data.cheers)
      setStatus('ready')
    }).catch((nextError) => { setError(nextError.message); setStatus('error') })
  }, [])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  const completed = tasks.filter((item) => item.done).length + goals.filter((item) => item.count >= item.target).length
  const total = tasks.length + goals.length
  const percent = total ? Math.round((completed / total) * 100) : 0
  const partnerCompleted = workspace?.partnerItems.filter((item) => item.done || item.count >= item.target).length ?? 0
  const partnerTotal = workspace?.partnerItems.length ?? 0

  function share() {
    const data = encodeSnapshot({ habits: [], checkedHabits: [], weekLabel: dateRange(), weeklyGoals: { tasks, goals } })
    navigator.clipboard.writeText(`${appUrl('/share')}?data=${data}`).then(() => setCopied(true))
  }

  async function addTask(event) {
    event.preventDefault()
    if (!taskInput.trim()) return
    const id = await createIntention(workspace.weekId, workspace.user.id, taskInput.trim(), 'one_time')
    setTasks((items) => [...items, { id, name: taskInput.trim(), done: false }])
    setTaskInput('')
  }

  async function addGoal(event) {
    event.preventDefault()
    const target = Number.parseInt(goalInput.target, 10)
    if (!goalInput.name.trim() || !target) return
    const id = await createIntention(workspace.weekId, workspace.user.id, goalInput.name.trim(), 'count', target)
    setGoals((items) => [...items, { id, name: goalInput.name.trim(), target, count: 0 }])
    setGoalInput({ name: '', target: '' })
  }

  async function addCheer(event) {
    event.preventDefault()
    if (!note.trim()) return
    const cheer = await createEncouragement(workspace.weekId, workspace.user.id, note.trim())
    setCheers((items) => [{ ...cheer, author: 'You' }, ...items])
    setNote('')
  }

  async function toggleTask(task) {
    const done = !task.done
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, done } : item))
    await setProgress(task.id, workspace.user.id, done ? 1 : 0)
  }

  async function adjustGoal(goal, change) {
    const count = Math.max(0, goal.count + change)
    setGoals((items) => items.map((item) => item.id === goal.id ? { ...item, count } : item))
    await setProgress(goal.id, workspace.user.id, count)
  }

  async function deleteItem(id, setter) {
    setter((items) => items.filter((item) => item.id !== id))
    await removeIntention(id)
  }

  async function invitePartner(event) {
    event.preventDefault()
    if (!inviteEmail.trim()) return
    try {
      const token = await createInvitation(workspace.partnershipId, workspace.user.id, inviteEmail)
      const link = appUrl(`/invite/${token}`)
      setInviteLink(link)
      await navigator.clipboard.writeText(link)
    } catch (nextError) { setError(nextError.message) }
  }

  if (status === 'loading') return <main className="week-shell"><p className="hero-copy">Loading your week…</p></main>
  if (status === 'signed-out') return <main className="week-shell"><h1>Sign in to see your week.</h1><a className="share-btn" href={appPath('/signin')}>Sign in</a></main>
  if (status === 'error') return <main className="week-shell"><h1>We couldn’t load your week.</h1><p className="hero-copy">{error}</p></main>

  return <main className="week-shell">
    <header className="week-hero">
      <div><p className="eyebrow">This week · {dateRange()}</p><h1>Make the week count.</h1><p className="hero-copy">A few promises to yourself, with someone in your corner.</p></div>
      <button className="share-btn" onClick={share}>{copied ? 'Link copied ✓' : 'Share week ↗'}</button>
    </header>

    <section className="pulse-card">
      <div className="pulse-copy"><span className="pulse-number">{percent}%</span><span className="pulse-label">of your intentions complete</span></div>
      <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
      <div className="people-row">
        <div className="person"><span className="avatar you">A</span><span><strong>You</strong><small>{completed} of {total} complete</small></span></div>
        {workspace.partner && <div className="person"><span className="avatar joey">{workspace.partner.display_name?.[0]?.toUpperCase() ?? 'P'}</span><span><strong>{workspace.partner.display_name}</strong><small>{partnerCompleted} of {partnerTotal} complete</small></span></div>}
        <span className="together-pill">{workspace.partner ? 'In it together' : 'Room for two'}</span>
      </div>
    </section>

    <div className="week-grid">
      <section className="intentions-panel">
        <div className="section-title-row"><div><p className="eyebrow">Your intentions</p><h2>Keep it achievable</h2></div><span className="count-pill">{total} this week</span></div>
        <div className="intention-group"><h3>Finish once</h3>
          {tasks.map((task) => <div className={`intention-row ${task.done ? 'complete' : ''}`} key={task.id}>
            <button className="check-control" onClick={() => toggleTask(task)}>{task.done ? '✓' : ''}</button>
            <span>{task.name}</span><button className="row-delete" onClick={() => deleteItem(task.id, setTasks)}>×</button>
          </div>)}
          <form className="quick-add" onSubmit={addTask}><input value={taskInput} onChange={(event) => setTaskInput(event.target.value)} placeholder="Add a one-time intention"/><button>Add</button></form>
        </div>
        <div className="intention-group"><h3>Build a rhythm</h3>
          {goals.map((goal) => <div className="rhythm-row" key={goal.id}>
            <div className="rhythm-top"><span>{goal.name}</span><strong>{goal.count} / {goal.target}</strong></div>
            <div className="mini-track"><span style={{ width: `${Math.min(100, goal.count / goal.target * 100)}%` }} /></div>
            <div className="rhythm-actions"><button onClick={() => adjustGoal(goal, -1)}>−</button><button onClick={() => adjustGoal(goal, 1)}>+</button><button onClick={() => deleteItem(goal.id, setGoals)}>×</button></div>
          </div>)}
          <form className="quick-add goal-add" onSubmit={addGoal}><input value={goalInput.name} onChange={(event) => setGoalInput((item) => ({ ...item, name: event.target.value }))} placeholder="Add a repeatable intention"/><input className="target-input" type="number" min="1" value={goalInput.target} onChange={(event) => setGoalInput((item) => ({ ...item, target: event.target.value }))} placeholder="Goal"/><button>Add</button></form>
        </div>
      </section>

      <aside className="partner-panel"><p className="eyebrow">Your partner</p><h2>{workspace.partner ? `${workspace.partner.display_name}'s week` : 'Invite someone in'}</h2>
        {workspace.partner ? <>
          {workspace.partnerItems.length === 0 && <p className="hero-copy">Your partner hasn’t added any intentions yet.</p>}
          {workspace.partnerItems.map((item) => <div className={`partner-goal ${item.done || item.count >= item.target ? 'done' : ''}`} key={item.id}><div><span>{item.name}</span><strong>{item.kind === 'count' ? `${item.count} / ${item.target}` : item.done ? 'Done ✓' : 'Not yet'}</strong></div><div className="mini-track"><span style={{ width: `${item.kind === 'count' ? Math.min(100, item.count / item.target * 100) : item.done ? 100 : 0}%` }} /></div></div>)}
          {cheers.map((cheer) => <div className={`cheer-card ${cheer.author_id === workspace.user.id ? 'own' : ''}`} key={cheer.id}><span className={`avatar ${cheer.author_id === workspace.user.id ? 'you' : 'joey'}`}>{cheer.author?.[0]?.toUpperCase() ?? 'P'}</span><p><strong>{cheer.author_id === workspace.user.id ? 'You' : cheer.author}</strong><small>{cheer.message}</small></p></div>)}
          <form className="cheer-form" onSubmit={addCheer}><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={`Encourage ${workspace.partner.display_name}…`}/><button>↑</button></form>
        </> : <>
          <p className="hero-copy">Cadence is better with someone in your corner. Invite them using the email they’ll sign in with.</p>
          <form className="cheer-form" onSubmit={invitePartner}><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="partner@example.com" required/><button>→</button></form>
          {inviteLink && <div className="cheer-card own"><span className="avatar you">✓</span><p><strong>Invite link copied</strong><small>Send it to {inviteEmail}. It expires in seven days.</small></p></div>}
          {error && <div className="cheer-card"><p><small>{error}</small></p></div>}
        </>}
      </aside>
    </div>
    <footer className="week-footer"><span>Next check-in</span><strong>Saturday morning</strong><p>Ten minutes to celebrate, reflect, and set the next cadence.</p></footer>
  </main>
}

export default Week
