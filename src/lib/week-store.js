import { loadCurrentWeek } from './cadence.js'
import { currentWeek } from './weeks.js'

const empty = (status = 'loading') => ({
  workspace: null,
  tasks: [],
  goals: [],
  cheers: [],
  status,
  error: '',
  busy: false,
})

// Session-only memory: no goals or partner messages are written to browser storage.
// Entries own their requests and writes, so navigation does not cancel a save.
export function createWeekStore(load = loadCurrentWeek) {
  let userId
  const entries = new Map()
  const listeners = new Set()
  const notify = () => listeners.forEach((listener) => listener())
  const active = (entry) => entries.get(entry.key) === entry && entry.userId === userId
  const publish = (entry, patch) => {
    if (!active(entry)) return
    entry.snapshot = { ...entry.snapshot, ...patch }
    notify()
  }

  function getEntry(startsOn = null) {
    const key = startsOn || 'current'
    let entry = entries.get(key)
    // Rollover also changes whether a dated plan is editable or historical.
    const workspace = entry?.snapshot.workspace
    if (workspace && workspace.currentStartsOn !== currentWeek(workspace.schedule)) {
      entries.delete(key)
      entry = null
    }
    if (!entry) {
      entry = {
        key,
        startsOn,
        userId,
        snapshot: empty(userId === null ? 'signed-out' : 'loading'),
        version: 0,
        pending: null,
        updatedAt: 0,
      }
      entries.set(key, entry)
    }
    return entry
  }

  async function refresh(entry, { ifStale = false, afterWrite = false } = {}) {
    if (!active(entry) || !userId || (entry.snapshot.busy && !afterWrite)) return
    if (entry.pending) return entry.pending
    if (ifStale && entry.updatedAt && Date.now() - entry.updatedAt < 10000) return
    const version = ++entry.version
    const valid = () => active(entry) && version === entry.version
    notify()
    const pending = (async () => {
      try {
        const data = await load(entry.startsOn)
        if (!valid()) return
        if (data.signedOut) {
          store.setUser(null)
          return
        }
        if (data.user.id !== userId) return
        entry.updatedAt = Date.now()
        publish(entry, {
          workspace: data,
          tasks: data.tasks,
          goals: data.goals,
          cheers: data.cheers,
          status: 'ready',
        })
      } catch (problem) {
        if (valid())
          publish(entry, {
            error: problem.message,
            status: entry.snapshot.workspace ? 'ready' : 'error',
          })
      } finally {
        if (valid()) entry.pending = null
      }
    })()
    entry.pending = pending
    return pending
  }

  const store = {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getEntry,
    refresh,
    setUser(nextId) {
      if (nextId === userId) return
      userId = nextId
      entries.clear()
      notify()
    },
    invalidate() {
      entries.clear()
      notify()
    },
    update(entry, field, value) {
      publish(entry, {
        [field]: typeof value === 'function' ? value(entry.snapshot[field]) : value,
      })
    },
    async save(entry, action) {
      if (!active(entry) || !userId || entry.snapshot.busy) return
      entry.version++
      entry.pending = null
      publish(entry, { busy: true, error: '' })
      try {
        await action()
      } catch (problem) {
        publish(entry, { error: 'Couldn’t save that change. ' + problem.message })
      } finally {
        if (active(entry)) {
          // Other date aliases may describe this same week. Reload them next time.
          for (const [key, other] of entries) {
            if (
              other !== entry &&
              !other.snapshot.busy &&
              entry.snapshot.workspace?.weekId &&
              other.snapshot.workspace?.weekId === entry.snapshot.workspace.weekId
            )
              entries.delete(key)
          }
          await refresh(entry, { afterWrite: true })
          publish(entry, { busy: false })
        }
      }
    },
  }
  return store
}

export const weekStore = createWeekStore()
