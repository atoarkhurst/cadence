import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import PartnershipPicker from './PartnershipPicker.jsx'
import { activePartnership } from './lib/active-partnership.js'
const api = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./lib/supabase.js', () => ({ supabase: { rpc: api.rpc } }))
const joey = '11111111-1111-4111-8111-111111111111'
const amari = '22222222-2222-4222-8222-222222222222'
function CurrentRoute() {
  const location = useLocation()
  return <p>{location.pathname + location.search}</p>
}
afterEach(() => {
  cleanup()
  activePartnership.setUser(null)
  activePartnership.select(null)
  localStorage.clear()
  vi.resetAllMocks()
})
test('switching from Today preserves the view and remembers the account-specific selection', async () => {
  activePartnership.setUser('me')
  activePartnership.select(joey)
  api.rpc.mockResolvedValue({
    data: [
      { id: joey, partner_id: 'j', partner_name: 'Joey' },
      { id: amari, partner_id: 'a', partner_name: 'Amari' },
    ],
  })
  render(
    <MemoryRouter initialEntries={['/']}>
      <PartnershipPicker userId="me" />
      <Routes>
        <Route path="/" element={<p>Today view</p>} />
        <Route path="/week" element={<p>Week view</p>} />
      </Routes>
    </MemoryRouter>,
  )
  const summary = await screen.findByText('With Joey')
  fireEvent.click(summary)
  // jsdom does not simulate native details toggling.
  summary.closest('details').open = true
  fireEvent.click(await screen.findByRole('button', { name: 'Amari' }))
  await screen.findByText('With Amari')
  expect(screen.getByText('Today view')).toBeTruthy()
  expect(activePartnership.get()).toBe(amari)
  expect(localStorage.getItem('cadence-partnership:me')).toBe(amari)
  activePartnership.setUser('different-user')
  expect(activePartnership.get()).toBeNull()
})

test('a solo workspace is clearly labeled as visible only to its owner', async () => {
  activePartnership.setUser('me')
  activePartnership.select(amari)
  api.rpc.mockResolvedValue({
    data: [
      { id: joey, partner_id: 'j', partner_name: 'Joey' },
      { id: amari, partner_id: null, partner_name: null, pending_email: null },
    ],
  })
  render(
    <MemoryRouter>
      <PartnershipPicker userId="me" />
    </MemoryRouter>,
  )
  expect(await screen.findByText('Personal plan')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Personal plan · only you' })).toBeTruthy()
})

test('an unused solo selection falls back to the connected plan when hidden', async () => {
  activePartnership.setUser('me')
  activePartnership.select(amari)
  api.rpc.mockResolvedValue({ data: [{ id: joey, partner_id: 'j', partner_name: 'Joey' }] })
  render(
    <MemoryRouter>
      <PartnershipPicker userId="me" />
    </MemoryRouter>,
  )
  expect(await screen.findByText('With Joey')).toBeTruthy()
  expect(activePartnership.get()).toBe(joey)
})

test('switching in Account keeps the settings section and clears an old partnership URL', async () => {
  activePartnership.setUser('me')
  activePartnership.select(joey)
  api.rpc.mockResolvedValue({
    data: [
      { id: joey, partner_id: 'j', partner_name: 'Joey' },
      { id: amari, partner_id: 'a', partner_name: 'Amari' },
    ],
  })
  render(
    <MemoryRouter initialEntries={['/signin?section=partnership&partnership=' + joey]}>
      <PartnershipPicker userId="me" />
      <CurrentRoute />
    </MemoryRouter>,
  )
  const summary = await screen.findByText('With Joey')
  summary.closest('details').open = true
  fireEvent.click(screen.getByRole('button', { name: 'Amari' }))
  await screen.findByText('With Amari')
  expect(screen.getByText('/signin?section=partnership')).toBeTruthy()
})

test('a late result for a signed-out account cannot select its private plan', async () => {
  activePartnership.setUser('me')
  let resolve
  api.rpc.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  render(
    <MemoryRouter>
      <PartnershipPicker userId="me" />
    </MemoryRouter>,
  )
  await act(async () => {
    activePartnership.setUser('other')
    resolve({ data: [{ id: joey, partner_id: 'j', partner_name: 'Joey' }] })
  })
  expect(activePartnership.get()).toBeNull()
  expect(screen.queryByText('With Joey')).toBeNull()
})
