function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayDate() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function calculateStreak() {
  let stored = { current: 0, longest: 0, lastDate: null }
  try {
    const raw = localStorage.getItem('cadence-streak')
    if (raw) stored = { ...stored, ...JSON.parse(raw) }
  } catch { /* use defaults */ }

  let log = {}
  try {
    const raw = localStorage.getItem('cadence-daily-log')
    if (raw) log = JSON.parse(raw)
  } catch { /* use empty */ }

  const today = todayDate()
  const yesterday = yesterdayDate()

  // Already processed today — return stored values unchanged.
  if (stored.lastDate === today) {
    return { current: stored.current, longest: stored.longest }
  }

  let { current, longest } = stored

  if (stored.lastDate === yesterday) {
    // Continuing from yesterday — increment only if yesterday was fully completed.
    current = log[yesterday] === true ? current + 1 : 0
  } else {
    // Gap of more than one day (or first ever run) — streak broken.
    current = 0
  }

  if (current > longest) longest = current

  localStorage.setItem('cadence-streak', JSON.stringify({ current, longest, lastDate: today }))

  return { current, longest }
}
