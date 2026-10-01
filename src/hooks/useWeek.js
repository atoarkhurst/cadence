import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCurrentWeek } from '../lib/cadence.js'

// Both dashboards use this lifecycle. Invalidate reads started before a save
// so a slow response cannot replace newer progress with stale data.
export function useWeek(startsOn = null) {
  const [workspace, setWorkspace] = useState(null)
  const [tasks, setTasks] = useState([])
  const [goals, setGoals] = useState([])
  const [cheers, setCheers] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const writing = useRef(false)
  const mounted = useRef(false)

  const refreshWeek = useCallback(async () => {
    if (writing.current) return
    const request = ++version.current
    try {
      const data = await loadCurrentWeek(startsOn)
      if (!mounted.current || request !== version.current) return
      if (data.signedOut) {
        setWorkspace(null)
        setTasks([])
        setGoals([])
        setCheers([])
        setStatus('signed-out')
        return
      }
      setWorkspace(data)
      setTasks(data.tasks)
      setGoals(data.goals)
      setCheers(data.cheers)
      setStatus('ready')
    } catch (problem) {
      if (!mounted.current || request !== version.current) return
      setError(problem.message)
      setStatus((previous) => (previous === 'loading' ? 'error' : previous))
    }
  }, [startsOn])

  useEffect(() => {
    const sequence = version
    mounted.current = true
    const refresh = () => {
      if (document.visibilityState === 'visible') void refreshWeek()
    }
    refresh()
    const timer = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      mounted.current = false
      sequence.current++
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refreshWeek])

  async function saveChange(action) {
    if (writing.current) return
    writing.current = true
    version.current++
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (problem) {
      if (mounted.current) setError('Couldn’t save that change. ' + problem.message)
    } finally {
      writing.current = false
      if (mounted.current) {
        // Reload server truth on success AND on a stale-device conflict.
        await refreshWeek()
        if (mounted.current) setBusy(false)
      }
    }
  }

  return {
    workspace,
    tasks,
    goals,
    cheers,
    status,
    error,
    busy,
    setTasks,
    setGoals,
    setCheers,
    setError,
    saveChange,
    refreshWeek,
  }
}
