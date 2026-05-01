import { useState, useEffect } from 'react'
import './Week.css'

// Returns "YYYY-Www" using the ISO week number so the key rolls over on
// Monday each week without any manual cleanup.
function weekKey() {
  const now = new Date()
  // ISO week: Thursday of the current week determines the year.
  const thursday = new Date(now)
  thursday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + 3)
  const yearStart = new Date(thursday.getFullYear(), 0, 1)
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7)
  return `cadence-week-${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function loadState() {
  try {
    const raw = localStorage.getItem(weekKey())
    if (!raw) return { tasks: [], goals: [] }
    return JSON.parse(raw)
  } catch {
    return { tasks: [], goals: [] }
  }
}

function Week() {
  const [tasks, setTasks] = useState(() => loadState().tasks)
  const [goals, setGoals] = useState(() => loadState().goals)
  const [taskInput, setTaskInput] = useState('')
  const [goalInput, setGoalInput] = useState({ name: '', target: '' })

  // Write both lists together whenever either changes.
  useEffect(() => {
    localStorage.setItem(weekKey(), JSON.stringify({ tasks, goals }))
  }, [tasks, goals])

  // --- one-time tasks ---

  const addTask = (e) => {
    e.preventDefault()
    const name = taskInput.trim()
    if (!name) return
    setTasks((prev) => [...prev, { id: crypto.randomUUID(), name, done: false }])
    setTaskInput('')
  }

  const toggleTask = (id) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    )

  const deleteTask = (id) =>
    setTasks((prev) => prev.filter((t) => t.id !== id))

  // --- frequency goals ---

  const addGoal = (e) => {
    e.preventDefault()
    const name = goalInput.name.trim()
    const target = parseInt(goalInput.target, 10)
    if (!name || !target || target < 1) return
    setGoals((prev) => [...prev, { id: crypto.randomUUID(), name, target, count: 0 }])
    setGoalInput({ name: '', target: '' })
  }

  const increment = (id) =>
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, count: g.count + 1 } : g)),
    )

  const deleteGoal = (id) =>
    setGoals((prev) => prev.filter((g) => g.id !== id))

  const now = new Date()
  const weekLabel = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  return (
    <div className="tracker">
      <p className="date">Week of {weekLabel}</p>
      <h1>Weekly Goals</h1>

      {/* ── One-time tasks ── */}
      <section className="week-section">
        <h2 className="section-heading">One-time tasks</h2>
        <ul className="habit-list">
          {tasks.map((task) => (
            <li key={task.id} className={`habit-item ${task.done ? 'done' : ''}`}>
              <label>
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggleTask(task.id)}
                />
                <span className="habit-name">{task.name}</span>
              </label>
              <button
                className="delete-btn"
                onClick={() => deleteTask(task.id)}
                aria-label={`Delete ${task.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form className="add-habit-form" onSubmit={addTask}>
          <input
            type="text"
            className="add-habit-input"
            placeholder="New task…"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
          />
          <button type="submit" className="add-habit-btn">Add</button>
        </form>
      </section>

      {/* ── Frequency goals ── */}
      <section className="week-section">
        <h2 className="section-heading">Frequency goals</h2>
        <ul className="habit-list">
          {goals.map((goal) => {
            const met = goal.count >= goal.target
            return (
              <li key={goal.id} className={`habit-item ${met ? 'done' : ''}`}>
                <div className="goal-info">
                  <span className="habit-name">{goal.name}</span>
                  <span className="goal-count">
                    {goal.count} / {goal.target}
                  </span>
                </div>
                <div className="goal-controls">
                  <button
                    className="increment-btn"
                    onClick={() => increment(goal.id)}
                    aria-label={`Increment ${goal.name}`}
                  >
                    +
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => deleteGoal(goal.id)}
                    aria-label={`Delete ${goal.name}`}
                  >
                    ×
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <form className="add-habit-form add-goal-form" onSubmit={addGoal}>
          <input
            type="text"
            className="add-habit-input"
            placeholder="Goal name…"
            value={goalInput.name}
            onChange={(e) => setGoalInput((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            type="number"
            className="add-habit-input goal-target-input"
            placeholder="×"
            min="1"
            value={goalInput.target}
            onChange={(e) => setGoalInput((prev) => ({ ...prev, target: e.target.value }))}
          />
          <button type="submit" className="add-habit-btn">Add</button>
        </form>
      </section>
    </div>
  )
}

export default Week
