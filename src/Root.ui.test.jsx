import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Root from './Root.jsx'
import { activePartnership } from './lib/active-partnership.js'

const api = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./lib/supabase.js', () => ({ supabase: { rpc: api.rpc } }))
vi.mock('./hooks/useWeekSession.js', () => ({ useWeekSession: () => {} }))
vi.mock('./EncouragementProvider.jsx', () => ({ default: ({ children }) => children }))
vi.mock('./lib/encouragement-context.js', () => ({
  useEncouragement: () => ({ userId: 'me', unreadCount: 0 }),
}))

const valid = '11111111-1111-4111-8111-111111111111'
const stale = '22222222-2222-4222-8222-222222222222'
function RouteProbe() {
  const location = useLocation()
  return <p>Current route: {location.pathname + location.search}</p>
}
afterEach(() => {
  cleanup()
  activePartnership.setUser(null)
  activePartnership.select(null)
  localStorage.clear()
  vi.resetAllMocks()
})
test.each([stale, 'not-a-partnership'])(
  'navigation and picker settle on an available connection when the URL names %s',
  async (requested) => {
    activePartnership.setUser('me')
    activePartnership.select(valid)
    const select = vi.spyOn(activePartnership, 'select')
    api.rpc.mockResolvedValue({
      data: [{ id: valid, partner_id: 'partner', partner_name: 'Joey' }],
    })
    render(
      <MemoryRouter initialEntries={['/week?partnership=' + requested + '&week=2026-10-05']}>
        <Routes>
          <Route element={<Root />}>
            <Route path="/week" element={<RouteProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('With Joey')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByText('Current route: /week?week=2026-10-05')).toBeTruthy(),
    )
    expect(activePartnership.get()).toBe(valid)
    expect(screen.getByRole('button', { name: 'Joey' })).toBeTruthy()
    expect(select.mock.calls.length).toBeLessThanOrEqual(2)
  },
)
