import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { activePartnership } from './lib/active-partnership.js'
import './Partnerships.css'

function PlanMark({ item }) {
  return (
    <span className={`plan-mark${item?.partner_id ? ' paired' : ''}`} aria-hidden="true">
      {item?.partner_id ? (
        (item.partner_name || 'Partner').trim().charAt(0).toUpperCase()
      ) : (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="3" width="11" height="14" rx="2" />
          <path d="M3 6h4M3 10h4M3 14h4M9 7h4M9 11h4" />
        </svg>
      )}
    </span>
  )
}

export default function PartnershipPicker({ userId }) {
  const picker = useRef(null)
  const selected = useSyncExternalStore(activePartnership.subscribe, activePartnership.get)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  useEffect(() => {
    const closeOutside = (event) => {
      if (picker.current && !picker.current.contains(event.target)) picker.current.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])
  const refresh = useCallback(async () => {
    let { data, error } = await supabase.rpc('list_partnerships_for_picker')
    // Keep the existing picker usable until the small, read-only update lands.
    if (error?.code === 'PGRST202') ({ data, error } = await supabase.rpc('list_partnerships'))
    if (error) throw error
    return data
  }, [])
  useEffect(() => {
    let active = true
    let running = false
    const load = async () => {
      if (running || document.visibilityState !== 'visible') return
      running = true
      const account = activePartnership.getAccount()
      try {
        const data = await refresh()
        if (!active || account !== activePartnership.getAccount()) return
        setItems(data)
        const requested = new URLSearchParams(search).get('partnership')
        if (requested && !data.some((item) => item.id === requested)) {
          const params = new URLSearchParams(search)
          params.delete('partnership')
          navigate({ pathname, search: params.toString() }, { replace: true })
        }
        if (data.length && !data.some((item) => item.id === activePartnership.get()))
          activePartnership.select(data[0].id)
        setError('')
      } catch {
        if (active) setError('Couldn’t refresh your partners.')
      } finally {
        running = false
      }
    }
    void load()
    const timer = setInterval(load, 15000)
    window.addEventListener('focus', load)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [userId, selected, refresh, search, pathname, navigate])
  const current = items.find((item) => item.id === selected)
  const personalPlans = items.filter((item) => !item.partner_id && !item.pending_email)
  const personalLabel = (item) =>
    `Personal plan${personalPlans.length > 1 ? ` ${personalPlans.findIndex((plan) => plan.id === item.id) + 1}` : ''}`
  return (
    <details
      className="partnership-picker"
      ref={picker}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && picker.current.open) {
          picker.current.open = false
          picker.current.querySelector('summary').focus()
        }
      }}
    >
      <summary>
        <PlanMark item={current} />
        <span className="partnership-label">
          {current?.partner_id
            ? `With ${current.partner_name || 'your partner'}`
            : current?.pending_email
              ? 'Invitation pending'
              : current
                ? personalLabel(current)
                : 'Your partnerships'}
        </span>
        <svg
          className="plan-chevron"
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="m5 6 3 3 3-3" />
        </svg>
      </summary>
      <div className="partnership-menu">
        <p className="plan-menu-heading">Your plans</p>
        {items.map((item) => (
          <button
            key={item.id}
            aria-current={item.id === selected ? 'true' : undefined}
            onClick={(event) => {
              activePartnership.select(item.id)
              event.currentTarget.closest('details').open = false
              // Account controls must follow the chosen pair without losing
              // the settings section or retaining another pair's form state.
              if (pathname === '/signin') {
                const params = new URLSearchParams(search)
                params.delete('partnership')
                navigate({ pathname, search: params.toString() })
              } else navigate(pathname === '/' ? '/' : '/week')
            }}
          >
            <PlanMark item={item} />
            <span className="plan-option-label">
              {item.partner_id
                ? item.partner_name || 'Your partner'
                : item.pending_email
                  ? `Invited ${item.pending_email}`
                  : `${personalLabel(item)} · only you`}
            </span>
            {item.id === selected && (
              <span className="plan-check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
        <Link
          to="/partners"
          onClick={(event) => {
            event.currentTarget.closest('details').open = false
          }}
        >
          Add a partner & invitations
        </Link>
        {error && <p role="status">{error}</p>}
      </div>
    </details>
  )
}
