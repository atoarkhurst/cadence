export function localDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
export function mondayISO(date = new Date()) {
  const monday = new Date(date)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return localDate(monday)
}
export function nextWeek(start) {
  const date = new Date(start + 'T12:00:00')
  date.setDate(date.getDate() + 7)
  return localDate(date)
}
export function weekLabel(start) {
  const date = new Date(start + 'T12:00:00')
  const end = new Date(date)
  end.setDate(end.getDate() + 6)
  const options = { month: 'short', day: 'numeric' }
  return date.toLocaleDateString('en-US', options) + ' – ' + end.toLocaleDateString('en-US', options) + ', ' + end.getFullYear()
}
export function validWeek(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(value + 'T12:00:00')
  return !Number.isNaN(date.getTime()) && localDate(date) === value && date.getDay() === 1
}
