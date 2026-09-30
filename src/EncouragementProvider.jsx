import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { EncouragementContext } from './lib/encouragement-context.js'
import { reconcilePushAccount } from './lib/push.js'

export default function EncouragementProvider({ children }) {
  const [userId, setUserId] = useState(null)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [status, setStatus] = useState('loading')
  const [limit, setLimit] = useState(100)
  const version = useRef(0)
  const accountVersion = useRef(0)
  const reading = useRef(new Set())
  useEffect(() => {
    let active = true
    const sequence = version
    const account = accountVersion
    const sessionChanged = session => {
      if (!active) return
      version.current++
      account.current++
      setUserId(session?.user.id || null)
      setItems([]); setUnreadCount(0); setStatus(session ? 'loading' : 'signed-out')
      void reconcilePushAccount(session?.user.id || null).catch(() => {})
    }
    supabase.auth.getSession().then(({ data }) => sessionChanged(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'TOKEN_REFRESHED') sessionChanged(session)
    })
    return () => { active = false; sequence.current++; account.current++; data.subscription.unsubscribe() }
  }, [])
  const refresh = useCallback(async () => {
    if (!userId) return
    const request = ++version.current
    const [notes, count] = await Promise.all([
      supabase.from('encouragement_notifications').select('id, encouragement_id, read_at, created_at, weeks(starts_on), encouragements(message), profiles!encouragement_notifications_sender_id_fkey(display_name)').eq('recipient_id', userId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('encouragement_notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null),
    ])
    if (request !== version.current) return
    const error = notes.error || count.error
    if (error) {
      setStatus(['PGRST205', '42P01', 'PGRST200'].includes(error.code) ? 'not-ready' : 'error')
      return
    }
    setItems(notes.data); setUnreadCount(count.count || 0); setStatus('ready')
  }, [userId, limit])
  useEffect(() => {
    const sequence = version
    const check = () => { if (document.visibilityState === 'visible') void refresh().catch(() => setStatus('error')) }
    check()
    const timer = setInterval(check, 15000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { sequence.current++; clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [refresh])
  const read = useCallback(async id => {
    const note = items.find(item => item.id === id)
    if (!note || note.read_at) return true
    if (reading.current.has(id)) return true
    reading.current.add(id)
    const account = accountVersion.current
    const { error } = await Promise.resolve(supabase.rpc('read_encouragement', { notification_id: id })).catch(() => ({ error: true }))
    reading.current.delete(id)
    if (error || account !== accountVersion.current) return false
    version.current++
    setItems(previous => previous.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
    setUnreadCount(previous => Math.max(0, previous - 1))
    return true
  }, [items])
  return <EncouragementContext.Provider value={{ items, unreadCount, status, userId, read, refresh, more: () => setLimit(value => value + 100), hasMore: items.length === limit }}>{children}</EncouragementContext.Provider>
}
