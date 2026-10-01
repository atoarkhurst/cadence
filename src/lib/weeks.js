export function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
export function mondayISO(date = new Date(), startDay = 1) {
  const monday = new Date(date)
  monday.setDate(monday.getDate() - ((monday.getDay() - startDay + 7) % 7))
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
  return (
    date.toLocaleDateString('en-US', options) +
    ' – ' +
    end.toLocaleDateString('en-US', options) +
    ', ' +
    end.getFullYear()
  )
}
export function validWeek(value, startDay = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(value + 'T12:00:00')
  return (
    !Number.isNaN(date.getTime()) &&
    localDate(date) === value &&
    (startDay === null || date.getDay() === startDay)
  )
}

export const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
export function scheduleToday(schedule, now = new Date()) {
  if (!schedule?.timezone) return localDate(now)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: schedule.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type).value
  return get('year') + '-' + get('month') + '-' + get('day')
}
export function currentWeek(schedule, now = new Date()) {
  const today = scheduleToday(schedule, now)
  const day =
    schedule && today >= schedule.effective_on ? schedule.start_day : (schedule?.previous_day ?? 1)
  return mondayISO(new Date(today + 'T12:00:00'), day)
}
export function upcomingStart(day, schedule, now = new Date()) {
  const date = new Date(currentWeek(schedule, now) + 'T12:00:00')
  date.setDate(date.getDate() + ((day - date.getDay() + 7) % 7))
  return localDate(date)
}
