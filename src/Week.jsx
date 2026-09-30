import { useCallback, useEffect, useRef, useState } from 'react'
import { encodeSnapshot } from './utils/share.js'
import { createEncouragement, createIntention, createInvitation, loadCurrentWeek, removeIntention, setProgress } from './lib/cadence.js'
import { appPath, appUrl } from './lib/paths.js'
import './Week.css'
import PartnerInvitations from './PartnerInvitations.jsx'
import { dayNames, weekLabel } from './lib/weeks.js'
import './Review.css'
import { isComplete } from './lib/partnership.js'
import { useEncouragement } from './lib/encouragement-context.js'
import EncouragementNote from './EncouragementNote.jsx'


function Week() {
  const { items: notifications } = useEncouragement()
  const requestedWeek = new URLSearchParams(window.location.search).get('week')

  const writing = useRef(false)
  const [busy, setBusy] = useState(false)
  const [tasks, setTasks] = useState([])
  const [goals, setGoals] = useState([])
  const [workspace, setWorkspace] = useState(null)
  const selectedWeek = workspace?.startsOn
  const past = selectedWeek < workspace?.currentStartsOn
  const future = selectedWeek > workspace?.currentStartsOn
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [taskInput, setTaskInput] = useState('')
  const [goalInput, setGoalInput] = useState({ name: '', target: '' })
  const [note, setNote] = useState('')
  const [cheers, setCheers] = useState([])
  const [copied, setCopied] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [taskOpen, setTaskOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [invitation, setInvitation] = useState(null)
  const [inviteCopied, setInviteCopied] = useState(false)

  const refreshWeek = useCallback(async () => {
    return loadCurrentWeek(requestedWeek).then((data) => {
      if (data.signedOut) return setStatus('signed-out')
      setWorkspace(data)
      setTasks(data.tasks)
      setGoals(data.goals)
      setCheers(data.cheers)
      setStatus('ready')
    }).catch((nextError) => { setError(nextError.message); setStatus((previous) => previous === 'loading' ? 'error' : previous) })
  }, [requestedWeek])
  useEffect(() => {
    let active = true
    const refresh = () => { if (active && !writing.current && document.visibilityState === 'visible') refreshWeek() }
    refresh()
    const timer = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refreshWeek])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  useEffect(() => {
    if (status === 'ready' && window.location.hash === '#received-encouragement') {
      document.getElementById('received-encouragement')?.scrollIntoView({ block: 'start' })
    }
  }, [status, selectedWeek])

  const completed = tasks.filter((item) => item.done).length + goals.filter((item) => item.count >= item.target).length
  const total = tasks.length + goals.length
  const partnerCompleted = workspace?.partnerItems.filter(isComplete).length ?? 0
  const partnerTotal = workspace?.partnerItems.length ?? 0

  async function share() {
    const data = encodeSnapshot({ habits: [], checkedHabits: [], weekLabel: weekLabel(selectedWeek), weeklyGoals: { tasks, goals } })
    try { await navigator.clipboard.writeText(`${appUrl('/share')}?data=${data}`); setCopied(true) } catch { setError('Couldn’t copy the link. Please allow clipboard access and try again.') }
  }

  async function saveChange(action) {
    if (writing.current) return
    writing.current = true
    setBusy(true)
    setError('')
    try { await action() }
    catch (problem) { setError('Couldn’t save that change. Please try again. ' + problem.message) }
    finally { writing.current = false; setBusy(false) }
  }

  async function addTask(event) {
    event.preventDefault()
    if (!taskInput.trim()) return
    const id = await createIntention(workspace.weekId, workspace.user.id, taskInput.trim(), 'one_time')
    setTasks((items) => [...items, { id, name: taskInput.trim(), done: false }])
    setTaskInput('')
    setTaskOpen(false)
  }

  async function addGoal(event) {
    event.preventDefault()
    const target = Number.parseInt(goalInput.target, 10)
    if (!goalInput.name.trim() || !target) return
    const id = await createIntention(workspace.weekId, workspace.user.id, goalInput.name.trim(), 'count', target)
    setGoals((items) => [...items, { id, name: goalInput.name.trim(), target, count: 0 }])
    setGoalInput({ name: '', target: '' })
    setGoalOpen(false)
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
    await setProgress(task.id, workspace.user.id, done ? 1 : 0)
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, done } : item))
  }

  async function adjustGoal(goal, change) {
    const count = Math.max(0, goal.count + change)
    await setProgress(goal.id, workspace.user.id, count)
    setGoals((items) => items.map((item) => item.id === goal.id ? { ...item, count } : item))
  }

  async function deleteItem(id, setter) {
    await removeIntention(id)
    setter((items) => items.filter((item) => item.id !== id))
  }

  async function invitePartner(event) {
    event.preventDefault()
    if (!inviteEmail.trim()) return
    try {
      const created = await createInvitation(workspace.partnershipId, workspace.user.id, inviteEmail)
      setInvitation({ ...created, link: appUrl(`/invite/${created.token}`) })
      setInviteCopied(false)
      setError('')
    } catch (nextError) { setError(nextError.message) }
  }

  if (status === 'loading') return <main className="week-shell week-studio"><p className="hero-copy">Loading your week…</p></main>
  if (status === 'signed-out') return <main className="week-shell week-studio"><h1>Sign in to see your week.</h1><a className="share-btn" href={appPath('/signin')}>Sign in</a></main>
  if (status === 'error') return <main className="week-shell week-studio"><h1>We couldn’t load your week.</h1><p className="hero-copy">{error}</p></main>

  return <main className="week-shell week-studio">
    <header className="week-hero">
      <div><p className="eyebrow">{past ? 'Past week' : future ? 'Planning ahead' : 'This week'} · {weekLabel(selectedWeek)}</p><h1>{past ? 'Your past week.' : future ? 'The week ahead.' : 'Find your rhythm.'}</h1></div>
      <div className="rhythm-signature" aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/></div><button className="share-btn" onClick={share}>{copied ? 'Link copied ✓' : 'Share week ↗'}</button>
    </header>

    <div className="week-tools">{!past && !future && workspace.previousStartsOn && <a href={appPath('/review?week=' + workspace.previousStartsOn)}>Review last week</a>}<a href={appPath('/review?week=' + selectedWeek)}>{past ? 'View review & history' : 'Review this week'}</a><a href={appPath('/week?week=' + workspace.nextStartsOn)}>Plan the following week →</a>{requestedWeek && <a href={appPath('/week')}>Back to this week</a>}<a href={appPath('/review')}>History</a></div>
    {past && <p className="week-notice">This is a past week. Its intentions and progress are kept here for you to look back on.</p>}
    {future && <p className="week-notice">You’re planning ahead. Today continues to show the current week. Aim for 3–4 intentions you can realistically complete.</p>}
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Saving…</p>}
    <div className="week-grid">
      <section className="intentions-panel">
        <div className="section-title-row"><div><p className="eyebrow">Your intentions</p><h2>Your week</h2></div><span className="count-pill">{completed}<span> / {total} done</span></span></div>
        {!total && <p className="hero-copy">Choose 3–4 achievable goals. Use “Finish once” for one-time tasks and “Build a rhythm” to count pages, applications, or sessions.</p>}
        <fieldset className="week-controls" disabled={busy || past}>
        <div className="intention-group"><h3><span>01</span> Finish once</h3>
          {tasks.map((task) => <div className={`intention-row ${task.done ? 'complete' : ''}`} key={task.id}>
            <button className="check-control" aria-pressed={task.done} aria-label={'Mark ' + task.name + (task.done ? ' incomplete' : ' complete')} onClick={() => saveChange(() => toggleTask(task))}>{task.done ? '✓' : ''}</button>
            <span>{task.name}</span><button className="row-delete" aria-label={'Delete ' + task.name} onClick={() => saveChange(() => deleteItem(task.id, setTasks))}>×</button>
          </div>)}
          {!past && <button type="button" className="add-intention-trigger" aria-expanded={taskOpen} aria-controls="task-composer" onClick={() => setTaskOpen(value => !value)}>{taskOpen ? '− Close' : '+ Add an intention'}</button>}
          {taskOpen && <form id="task-composer" className="quick-add" onSubmit={event => { event.preventDefault(); saveChange(() => addTask(event)) }}><input value={taskInput} onChange={(event) => setTaskInput(event.target.value)} maxLength={160} aria-label="One-time intention" placeholder="What would make this week feel good?" required autoFocus/><button>Add</button></form>}
        </div>
        <div className="intention-group"><h3><span>02</span> Build a rhythm</h3>
          {goals.map((goal) => <div className="rhythm-row" key={goal.id}>
            <div className="rhythm-top"><span>{goal.name}</span><strong>{goal.count} / {goal.target}</strong></div>
            <div className="mini-track"><span style={{ width: `${Math.min(100, goal.count / goal.target * 100)}%` }} /></div>
            <div className="rhythm-actions"><button aria-label={'Decrease ' + goal.name} onClick={() => saveChange(() => adjustGoal(goal, -1))}>−</button><button aria-label={'Increase ' + goal.name} onClick={() => saveChange(() => adjustGoal(goal, 1))}>+</button><button aria-label={'Delete ' + goal.name} onClick={() => saveChange(() => deleteItem(goal.id, setGoals))}>×</button></div>
          </div>)}
          {!past && <button type="button" className="add-intention-trigger" aria-expanded={goalOpen} aria-controls="goal-composer" onClick={() => setGoalOpen(value => !value)}>{goalOpen ? '− Close' : '+ Add a repeatable intention'}</button>}
          {goalOpen && <form id="goal-composer" className="quick-add goal-add" onSubmit={event => { event.preventDefault(); saveChange(() => addGoal(event)) }}><input value={goalInput.name} onChange={(event) => setGoalInput((item) => ({ ...item, name: event.target.value }))} maxLength={160} aria-label="Repeatable intention" placeholder="e.g. Read 100 pages" required autoFocus/><input className="target-input" aria-label="Weekly target" type="number" min="1" max="1000000" value={goalInput.target} onChange={(event) => setGoalInput((item) => ({ ...item, target: event.target.value }))} placeholder="Target" inputMode="numeric" required/><button>Add</button></form>}
        </div>
        </fieldset>
        {workspace.partner && <section className="encouragement-section" aria-labelledby="received-encouragement">
          <h3 id="received-encouragement">Encouragement for you</h3>
          {cheers.filter(cheer => cheer.author_id === workspace.partner.id).map(cheer => <EncouragementNote key={cheer.id} notification={notifications.find(item => item.encouragement_id === cheer.id)} author={cheer.author} message={cheer.message} />)}
          {!cheers.some(cheer => cheer.author_id === workspace.partner.id) && <p className="encouragement-hint">Notes from {workspace.partner.display_name} will appear here, alongside your goals.</p>}
        </section>}
      </section>

      <aside className="partner-panel"><div className="section-title-row"><div><p className="eyebrow">In your corner</p><h2>{workspace.partner ? workspace.partner.display_name + '’s week' : 'Invite your partner'}</h2></div>{workspace.partner && <span className="count-pill">{partnerCompleted}<span> / {partnerTotal} done</span></span>}</div>

        {workspace.partner && <button className="partner-refresh" disabled={busy} onClick={refreshWeek}>Refresh progress</button>}
        {error && <p role="alert">{error}</p>}
        {workspace.partner ? <>
          {workspace.partnerItems.length === 0 && <p className="hero-copy">Your partner hasn’t added any intentions yet.</p>}
          {workspace.partnerItems.map((item) => <div className={`partner-goal ${isComplete(item) ? 'done' : ''}`} key={item.id}><div><span>{item.name}</span><strong>{item.kind === 'count' ? `${item.count} / ${item.target}` : item.done ? 'Done ✓' : 'Not yet'}</strong></div><div className="mini-track"><span style={{ width: `${item.kind === 'count' ? Math.min(100, item.count / item.target * 100) : item.done ? 100 : 0}%` }} /></div></div>)}
          <section className="encouragement-section" aria-labelledby="sent-encouragement">
          <h3 id="sent-encouragement">Your encouragement for {workspace.partner.display_name}</h3>
          <p className="encouragement-hint">Your notes appear beneath their goals when they sign in.</p>
          {cheers.filter(cheer => cheer.author_id === workspace.user.id).map(cheer => <div className="cheer-card own" key={cheer.id}><span className="avatar you">{workspace.displayName?.[0]?.toUpperCase() ?? 'Y'}</span><p><strong>You</strong><small>{cheer.message}</small></p></div>)}
          <fieldset className="week-controls" disabled={busy || past}><form className="cheer-form" onSubmit={event => { event.preventDefault(); saveChange(() => addCheer(event)) }}><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={280} aria-label="Encouragement" placeholder={`Encourage ${workspace.partner.display_name}…`}/><button aria-label="Send encouragement">↑</button></form></fieldset>
          </section>
        </> : <>
          <PartnerInvitations key={workspace.user.id} user={workspace.user} onAccepted={refreshWeek} />
          <p className="hero-copy">Enter the email your partner uses for Cadence. They can accept on their “This week” page, or you can send them an invitation link. We won’t send an email.</p>
          <form className="cheer-form" onSubmit={event => { event.preventDefault(); saveChange(() => invitePartner(event)) }}><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} aria-label="Partner’s email" placeholder="partner@example.com" required disabled={busy}/><button disabled={busy} aria-label="Create invitation">→</button></form>
          {invitation && <div className="cheer-card own"><div className="invitation-result"><strong>Invitation ready for {invitation.email}</strong><small>Send this link to your partner. They’ll need to sign in with that email to accept. If they’re already signed in, they can also check for invitations on “This week”.</small><small>Expires {new Date(invitation.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.</small><input aria-label="Invitation link" readOnly value={invitation.link} onFocus={(event) => event.target.select()}/><button className="review-primary" onClick={async () => { try { await navigator.clipboard.writeText(invitation.link); setInviteCopied(true) } catch { setError('Select and copy the invitation link above.') } }}>{inviteCopied ? 'Link copied ✓' : 'Copy invitation link'}</button><span role="status">{inviteCopied ? 'Ready to paste into a text or message.' : ''}</span></div></div>}
          {error && <div className="cheer-card"><p><small>{error}</small></p></div>}
        </>}
      </aside>
    </div>
    <footer className="week-footer"><span>Next check-in</span><strong>{dayNames[workspace.schedule?.start_day ?? 1]}</strong><p>Ten minutes to celebrate, reflect, and choose what comes next.</p><a className="review-primary" href={appPath('/review?week=' + (workspace.previousStartsOn || selectedWeek))}>Open your weekly check-in →</a></footer>
  </main>
}

export default Week
