import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { weekStore } from '../lib/week-store.js'

// Today and This week subscribe to one session cache. A remount can render the
// last result immediately while an older result is refreshed in the background.
export function useWeek(startsOn = null) {
  const getSnapshot = useCallback(() => weekStore.getEntry(startsOn).snapshot, [startsOn])
  const snapshot = useSyncExternalStore(weekStore.subscribe, getSnapshot)
  const entry = weekStore.getEntry(startsOn)
  const refreshWeek = useCallback(() => weekStore.refresh(entry), [entry])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      // getEntry also checks for week rollover after the app has been asleep.
      const current = weekStore.getEntry(startsOn)
      void weekStore.refresh(current, { ifStale: true })
    }
    refresh()
    const timer = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [entry, startsOn])

  return {
    ...snapshot,
    setTasks: (value) => weekStore.update(entry, 'tasks', value),
    setGoals: (value) => weekStore.update(entry, 'goals', value),
    setCheers: (value) => weekStore.update(entry, 'cheers', value),
    setError: (value) => weekStore.update(entry, 'error', value),
    saveChange: (action) => weekStore.save(entry, action),
    refreshWeek,
  }
}
