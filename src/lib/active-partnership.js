// Only opaque preferences are persisted. Goals and messages remain session-only.
let userId = null
let selected = null
const listeners = new Set()
export const validId = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')
export const activePartnership = {
  get: () => selected,
  getAccount: () => userId,
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  setUser(id) {
    if (id === userId) return
    userId = id
    let saved = null
    try {
      saved = id ? localStorage.getItem(`cadence-partnership:${id}`) : null
    } catch {
      /* Storage is optional. */
    }
    selected = validId(saved) ? saved : null
    listeners.forEach((listener) => listener())
  },
  select(id) {
    if (id !== null && !validId(id)) throw new Error('Choose a valid partnership.')
    if (selected === id) return
    selected = id
    try {
      if (userId) {
        if (id) localStorage.setItem(`cadence-partnership:${userId}`, id)
        else localStorage.removeItem(`cadence-partnership:${userId}`)
      }
    } catch {
      /* Private browsing must still work without storage. */
    }
    listeners.forEach((listener) => listener())
  },
}
