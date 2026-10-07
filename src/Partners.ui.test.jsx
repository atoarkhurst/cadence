import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Partners, { OutgoingInvitations } from './Partners.jsx'

const api = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), create: vi.fn() }))
vi.mock('./lib/supabase.js', () => ({
  supabase: { auth: { getUser: api.getUser }, from: api.from, rpc: api.rpc },
}))
vi.mock('./lib/cadence.js', () => ({ createInvitation: api.create }))
vi.mock('./PartnerInvitations.jsx', () => ({ default: () => <p>Received invitations</p> }))
const item = {
  token: '11111111-1111-4111-8111-111111111111',
  email: 'friend@example.com',
  expires_at: '2099-01-01',
  partnership_id: 'pair',
}
function query(data) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    gt: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve) => Promise.resolve({ data }).then(resolve),
  }
  return builder
}
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
test('pending invitations load after remount and cancellation requires confirmation', async () => {
  api.from.mockImplementation(() => query([item]))
  api.rpc.mockResolvedValue({ error: null })
  const first = render(<OutgoingInvitations userId="me" />)
  await screen.findByText(/Invitation pending/)
  first.unmount()
  render(<OutgoingInvitations userId="me" />)
  await screen.findByText(/Invitation pending/)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel invitation…' }))
  expect(api.rpc).not.toHaveBeenCalled()
  api.from.mockImplementation(() => query([]))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel invitation' }))
  await screen.findByText(/Invitation cancelled/)
  expect(api.rpc).toHaveBeenCalledWith('cancel_partner_invitation', {
    invitation_token: item.token,
  })
})
test('adding a partner creates a separate invitation without selecting or moving an existing plan', async () => {
  api.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
  api.from.mockImplementation(() => query([]))
  api.create.mockResolvedValue(item)
  render(
    <MemoryRouter>
      <Partners />
    </MemoryRouter>,
  )
  fireEvent.change(await screen.findByLabelText('Their email address'), {
    target: { value: 'friend@example.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }))
  await waitFor(() => expect(api.create).toHaveBeenCalledWith(null, 'me', 'friend@example.com'))
  await screen.findByText('Invitation ready. Share the link below.')
})
test('copying an invitation gives feedback beside that invitation', async () => {
  api.from.mockImplementation(() => query([item]))
  const writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  render(<OutgoingInvitations userId="me" />)
  const invitation = (await screen.findByText(/Invitation pending/)).closest('article')
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
  expect(invitation.querySelector('[role="status"]')?.textContent).toMatch(/Link copied/)
})
