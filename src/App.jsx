import { Link } from 'react-router-dom'
import { Fragment, useState } from 'react'
import { createIntention, setProgress } from './lib/cadence.js'
import { useWeek } from './hooks/useWeek.js'
import './App.css'
import { weekLabel } from './lib/weeks.js'
import { isComplete } from './lib/partnership.js'
import { IntentionActions, IntentionEditor } from './IntentionEditor.jsx'
import { useIntentionEditing } from './hooks/useIntentionEditing.js'

function App() {
  const { workspace, tasks, goals, busy, status, error, setTasks, setGoals, saveChange } = useWeek()
  const [input, setInput] = useState('')
  const [targetInput, setTargetInput] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [intentionKind, setIntentionKind] = useState('one_time')
  const { editing, setEditing, beginEdit, confirmDelete, saveEdit } = useIntentionEditing({
    workspace,
    tasks,
    goals,
    setTasks,
    setGoals,
    saveChange,
  })

  async function toggleTask(task) {
    const done = !task.done
    await setProgress(task.id, done ? 1 : 0, task.count ?? (task.done ? 1 : 0))
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, done, count: done ? 1 : 0 } : item)),
    )
  }

  async function addIntention() {
    const name = input.trim()
    if (!name) return
    if (intentionKind === 'count') {
      const target = Number(targetInput)
      if (!Number.isSafeInteger(target) || target < 1 || target > 1000000) return
      const id = await createIntention(workspace.weekId, workspace.user.id, name, 'count', target)
      setGoals((current) => [...current, { id, name, target, count: 0, kind: 'count' }])
    } else {
      const id = await createIntention(workspace.weekId, workspace.user.id, name, 'one_time')
      setTasks((current) => [...current, { id, name, done: false, kind: 'one_time' }])
    }
    setInput('')
    setTargetInput('')
    setComposerOpen(false)
  }

  async function adjustGoal(goal, change) {
    const count = Math.max(0, goal.count + change)
    await setProgress(goal.id, count, goal.count)
    setGoals((current) => current.map((item) => (item.id === goal.id ? { ...item, count } : item)))
  }

  if (status === 'loading')
    return (
      <main className="daily-shell">
        <p>Loading your day…</p>
      </main>
    )
  if (status === 'signed-out')
    return (
      <main className="daily-shell">
        <h1>Sign in to see your day.</h1>
        <Link to={'/signin'}>Sign in</Link>
      </main>
    )
  if (status === 'error')
    return (
      <main className="daily-shell">
        <h1>We couldn’t load your day.</h1>
        <p>{error}</p>
      </main>
    )

  const completed =
    tasks.filter((item) => item.done).length +
    goals.filter((item) => item.count >= item.target).length
  const total = tasks.length + goals.length
  const name = workspace.displayName || 'there'
  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 18
        ? 'Good afternoon'
        : 'Good evening'
  const partnerCompleted = workspace.partnerItems.filter(isComplete).length
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <main className="daily-shell">
      <header className="daily-header">
        <div>
          <p className="daily-date">{today}</p>
          <h1>
            {greeting}, {name}.
          </h1>
          <p>{weekLabel(workspace.startsOn)} · One plan, a little progress each day.</p>
        </div>
      </header>
      {workspace.previousStartsOn && (
        <Link className="daily-review-link" to={'/review?week=' + workspace.previousStartsOn}>
          Review last week →
        </Link>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Saving…</p>}
      <div className="daily-grid">
        <section className="today-card">
          <div className="card-heading">
            <div>
              <span>Your intentions</span>
              <h2>Keep going.</h2>
            </div>
            <strong>
              {completed} of {total}
            </strong>
          </div>
          {total === 0 && (
            <div className="daily-empty">
              <h3>Start with one achievable intention.</h3>
              <p>Anything you add here also appears on your weekly plan.</p>
            </div>
          )}
          <ul className="habit-list">
            {tasks.map((task) => (
              <li key={task.id} className="daily-task-entry">
                <div className={`habit-item ${task.done ? 'done' : ''}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={task.done}
                      disabled={busy}
                      onChange={() => saveChange(() => toggleTask(task))}
                    />
                    <span className="habit-name">
                      {task.name}
                      <small>Finish once</small>
                    </span>
                  </label>
                  <IntentionActions
                    item={task}
                    busy={busy}
                    onEdit={() => beginEdit(task, 'one_time')}
                    onDelete={() => confirmDelete(task, setTasks)}
                  />
                </div>
                {editing?.id === task.id && (
                  <IntentionEditor
                    draft={editing}
                    setDraft={setEditing}
                    onSave={saveEdit}
                    onCancel={() => setEditing(null)}
                    busy={busy}
                  />
                )}
              </li>
            ))}
          </ul>
          <div className="daily-rhythms">
            {goals.map((goal) => (
              <Fragment key={goal.id}>
                <div className={`daily-rhythm ${goal.count >= goal.target ? 'done' : ''}`}>
                  <div>
                    <span>{goal.name}</span>
                    <small>
                      Build a rhythm · {goal.count} of {goal.target}
                    </small>
                  </div>
                  <button
                    aria-label={'Decrease ' + goal.name}
                    onClick={() => saveChange(() => adjustGoal(goal, -1))}
                    disabled={busy || goal.count === 0}
                  >
                    −
                  </button>
                  <button
                    className="progress-add"
                    disabled={busy}
                    aria-label={'Increase ' + goal.name}
                    onClick={() => saveChange(() => adjustGoal(goal, 1))}
                  >
                    +1
                  </button>
                  <IntentionActions
                    item={goal}
                    busy={busy}
                    onEdit={() => beginEdit(goal, 'count')}
                    onDelete={() => confirmDelete(goal, setGoals)}
                  />
                </div>
                {editing?.id === goal.id && (
                  <IntentionEditor
                    draft={editing}
                    setDraft={setEditing}
                    onSave={saveEdit}
                    onCancel={() => setEditing(null)}
                    busy={busy}
                  />
                )}
              </Fragment>
            ))}
          </div>
          <div className="daily-actions">
            <button
              type="button"
              className="daily-add-trigger"
              aria-expanded={composerOpen}
              aria-controls="daily-intention-composer"
              onClick={() => setComposerOpen((open) => !open)}
            >
              {composerOpen ? '− Close goal entry' : '+ Add an intention'}
            </button>
            <Link className="daily-full-week" to={'/week'}>
              See the full week →
            </Link>
          </div>
          {composerOpen && (
            <div id="daily-intention-composer" className="daily-intention-composer">
              <div className="daily-intention-types" role="group" aria-label="Intention type">
                <button
                  type="button"
                  aria-pressed={intentionKind === 'one_time'}
                  onClick={() => setIntentionKind('one_time')}
                >
                  Finish once
                </button>
                <button
                  type="button"
                  aria-pressed={intentionKind === 'count'}
                  onClick={() => setIntentionKind('count')}
                >
                  Count progress
                </button>
              </div>
              <form
                className={`add-habit-form ${intentionKind === 'count' ? 'counted' : ''}`}
                onSubmit={(event) => {
                  event.preventDefault()
                  saveChange(addIntention)
                }}
              >
                {intentionKind === 'count' ? (
                  <label className="goal-name-field">
                    <span>Goal name</span>
                    <input
                      className="add-habit-input"
                      aria-label="Counted intention"
                      maxLength={160}
                      required
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="e.g. Read 100 pages"
                    />
                  </label>
                ) : (
                  <input
                    className="add-habit-input"
                    aria-label="One-time intention"
                    maxLength={160}
                    required
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="What will you finish?"
                  />
                )}
                {intentionKind === 'count' && (
                  <label className="weekly-amount-field">
                    <span>How many this week?</span>
                    <input
                      className="add-habit-target"
                      aria-label="Weekly target"
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      inputMode="numeric"
                      required
                      value={targetInput}
                      onChange={(event) => setTargetInput(event.target.value)}
                      placeholder="e.g. 4"
                    />
                  </label>
                )}
                <button className="add-habit-btn" disabled={busy}>
                  Add
                </button>
              </form>
            </div>
          )}
        </section>
        <aside className="daily-side">
          <section className="partner-note">
            <span className="side-label">In your corner</span>
            <div className="partner-note-top">
              <div>
                <strong>
                  {workspace.partner ? workspace.partner.display_name : 'Room for your person'}
                </strong>
                <small>
                  {workspace.partner
                    ? `${partnerCompleted} of ${workspace.partnerItems.length} complete`
                    : 'Share progress and encouragement'}
                </small>
              </div>
            </div>
            <p>
              {workspace.partner
                ? 'See how their week is moving and leave a quick note of encouragement.'
                : 'Invite someone you trust to share the weekly ritual with you.'}
            </p>
            <Link to={'/week'}>
              {workspace.partner ? 'See your shared week' : 'Invite a partner'}
            </Link>
          </section>
        </aside>
      </div>
    </main>
  )
}

export default App
