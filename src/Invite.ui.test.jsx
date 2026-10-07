import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Invite from './Invite.jsx'

const api = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), accept: vi.fn() }))
vi.mock('./lib/supabase.js', () => ({ supabase: { auth: { getUser: api.getUser }, rpc: api.rpc } }))
vi.mock('./lib/cadence.js', () => ({ acceptInvitation: api.accept, loadCurrentWeek: vi.fn() }))
const token = '11111111-1111-4111-8111-111111111111'
function open() {
  return render(
    <MemoryRouter initialEntries={['/invite/' + token]}>
      <Routes>
        <Route path="/invite/:token" element={<Invite />} />
        <Route path="/week" element={<p>Shared plan opened</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.resetAllMocks()
})
test('signed-out invitation retains token and links to invitation-aware sign in', async () => {
  api.getUser.mockResolvedValue({ data: { user: null } })
  open()
  expect(
    (await screen.findByRole('link', { name: 'Sign in to continue' })).getAttribute('href'),
  ).toBe('/signin?invite=' + token)
  expect(api.rpc).not.toHaveBeenCalled()
})
test('wrong account cannot accept or see sender details', async () => {
  api.getUser.mockResolvedValue({ data: { user: { id: 'wrong', email: 'wrong@example.com' } } })
  api.rpc.mockResolvedValue({ data: [] })
  open()
  await screen.findByText(/may be for a different email/)
  expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Use a different account' }).getAttribute('href')).toBe(
    '/signin?invite=' + token + '&switch=1',
  )
})
test('valid recipient sees sender, accepts once, and lands in shared plan', async () => {
  api.getUser.mockResolvedValue({
    data: { user: { id: 'recipient', email: 'recipient@example.com' } },
  })
  api.rpc.mockResolvedValue({ data: [{ name: 'Ato', accepted: false, expires_at: '2099-01-01' }] })
  api.accept.mockResolvedValue('partnership')
  open()
  await screen.findByRole('heading', { name: 'Ato invited you.' })
  fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }))
  await screen.findByText('Shared plan opened')
  expect(api.accept).toHaveBeenCalledWith(token)
  expect(localStorage.getItem('cadence-pending-invite')).toBeNull()
})
test('expired invitation explains recovery and has no acceptance button', async () => {
  api.getUser.mockResolvedValue({
    data: { user: { id: 'recipient', email: 'recipient@example.com' } },
  })
  api.rpc.mockResolvedValue({ data: [{ name: 'Ato', accepted: false, expires_at: '2000-01-01' }] })
  open()
  await screen.findByText(/expired or was cancelled/)
  expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull()
})
