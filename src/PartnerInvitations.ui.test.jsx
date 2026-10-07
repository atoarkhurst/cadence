import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PartnerInvitations from './PartnerInvitations.jsx'

const api = vi.hoisted(() => ({ rpc: vi.fn(), accept: vi.fn(), invalidate: vi.fn() }))
vi.mock('./lib/supabase.js', () => ({ supabase: { rpc: api.rpc } }))
vi.mock('./lib/cadence.js', () => ({ acceptInvitation: api.accept }))
vi.mock('./lib/week-store.js', () => ({ weekStore: { invalidate: api.invalidate } }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})
test('accepting an invitation succeeds when browser storage is unavailable', async () => {
  const onAccepted = vi.fn().mockResolvedValue(undefined)
  api.rpc.mockResolvedValue({ data: [{ token: 'invite-token', name: 'Joey' }] })
  api.accept.mockResolvedValue('connection-id')
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  render(
    <MemoryRouter initialEntries={['/partners']}>
      <Routes>
        <Route
          path="/partners"
          element={
            <PartnerInvitations
              user={{ id: 'me', email: 'me@example.com' }}
              onAccepted={onAccepted}
            />
          }
        />
        <Route path="/week" element={<p>Week opened</p>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }))
  await waitFor(() => expect(screen.getByText('Week opened')).toBeTruthy())
  expect(api.accept).toHaveBeenCalledWith('invite-token')
  expect(onAccepted).toHaveBeenCalledOnce()
})
