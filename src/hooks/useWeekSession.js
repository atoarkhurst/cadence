import { useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { weekStore } from '../lib/week-store.js'

export function useWeekSession() {
  useEffect(() => {
    let active = true
    let receivedEvent = false
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      receivedEvent = true
      weekStore.setUser(session?.user.id || null)
    })
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !receivedEvent)
          weekStore.setUser(error ? null : data.session?.user.id || null)
      })
      .catch(() => {
        if (active && !receivedEvent) weekStore.setUser(null)
      })
    return () => {
      active = false
      data.subscription.unsubscribe()
      weekStore.setUser(undefined)
    }
  }, [])
}
