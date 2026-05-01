import { useState, useEffect } from 'react'
import './App.css'

const DEFAULT_HABITS = [
  'Focusmate LeetCode session',
  'Learn React for 30 minutes',
  'Meditate for 20 minutes',
  'Plan tomorrow today',
]

const STORAGE_KEY = 'cadence-habits'

function todayDate() {
  return new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { habits: DEFAULT_HABITS, checked: {} }
    const { date, habits, checked } = JSON.parse(raw)
    // Habits survive across days; only checked resets when the date changes.
    return { habits, checked: date === todayDate() ? checked : {} }
  } catch {
    return { habits: DEFAULT_HABITS, checked: {} }
  }
}

function App() {
  const [habits, setHabits] = useState(() => loadState().habits)
  const [checked, setChecked] = useState(() => loadState().checked)
  const [input, setInput] = useState('')

  // Persist habits + checked + today's date together whenever either changes.
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ date: todayDate(), habits, checked }),
    )
  }, [habits, checked])

  const toggle = (habit) =>
    setChecked((prev) => ({ ...prev, [habit]: !prev[habit] }))

  const addHabit = (e) => {
    e.preventDefault()
    const name = input.trim()
    if (!name || habits.includes(name)) return
    setHabits((prev) => [...prev, name])
    setInput('')
  }

  // Remove the habit from the list and clean up its checked entry.
  const deleteHabit = (habit) => {
    setHabits((prev) => prev.filter((h) => h !== habit))
    setChecked((prev) => {
      const next = { ...prev }
      delete next[habit]
      return next
    })
  }

  const completedCount = Object.values(checked).filter(Boolean).length
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="tracker">
      <p className="date">{today}</p>
      <h1>Today's Habits</h1>
      <p className="progress">
        {completedCount} of {habits.length} complete
      </p>
      <ul className="habit-list">
        {habits.map((habit) => (
          <li key={habit} className={`habit-item ${checked[habit] ? 'done' : ''}`}>
            <label>
              <input
                type="checkbox"
                checked={!!checked[habit]}
                onChange={() => toggle(habit)}
              />
              <span className="habit-name">{habit}</span>
            </label>
            <button
              className="delete-btn"
              onClick={() => deleteHabit(habit)}
              aria-label={`Delete ${habit}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form className="add-habit-form" onSubmit={addHabit}>
        <input
          type="text"
          className="add-habit-input"
          placeholder="New habit…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="add-habit-btn">Add</button>
      </form>
    </div>
  )
}

export default App
