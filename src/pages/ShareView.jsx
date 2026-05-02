import { useSearchParams, Link } from 'react-router-dom'
import { decodeSnapshot } from '../utils/share.js'
import './ShareView.css'

function ShareView() {
  const [searchParams] = useSearchParams()
  const encoded = searchParams.get('data')
  const snapshot = encoded ? decodeSnapshot(encoded) : null

  if (!snapshot) {
    return (
      <div className="share-container">
        <p className="share-error">This link is invalid or has expired.</p>
      </div>
    )
  }

  const { habits = [], checkedHabits = [], weekLabel = '', weeklyGoals = {} } = snapshot
  const { tasks = [], goals = [] } = weeklyGoals

  return (
    <div className="share-container">
      <div className="tracker">
        <p className="date">{weekLabel}</p>
        <h1>Weekly Commitments</h1>

        {/* ── Daily habits ── */}
        {habits.length > 0 && (
          <section className="week-section">
            <h2 className="section-heading">Daily habits</h2>
            <ul className="habit-list">
              {habits.map((habit) => {
                const isChecked = checkedHabits.includes(habit)
                return (
                  <li key={habit} className={`habit-item ${isChecked ? 'done' : ''}`}>
                    <label>
                      <input type="checkbox" checked={isChecked} disabled onChange={() => {}} />
                      <span className="habit-name">{habit}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* ── One-time tasks ── */}
        {tasks.length > 0 && (
          <section className="week-section">
            <h2 className="section-heading">One-time tasks</h2>
            <ul className="habit-list">
              {tasks.map((task) => (
                <li key={task.id} className={`habit-item ${task.done ? 'done' : ''}`}>
                  <label>
                    <input type="checkbox" checked={task.done} disabled onChange={() => {}} />
                    <span className="habit-name">{task.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Frequency goals ── */}
        {goals.length > 0 && (
          <section className="week-section">
            <h2 className="section-heading">Frequency goals</h2>
            <ul className="habit-list">
              {goals.map((goal) => {
                const met = goal.count >= goal.target
                return (
                  <li key={goal.id} className={`habit-item ${met ? 'done' : ''}`}>
                    <div className="goal-info">
                      <span className="habit-name">{goal.name}</span>
                      <span className="goal-count">{goal.count} / {goal.target}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <footer className="share-footer">
          Track your own habits at <Link to="/">Cadence</Link>
        </footer>
      </div>
    </div>
  )
}

export default ShareView
