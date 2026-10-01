import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Auth from './Auth.jsx'

const auth = vi.hoisted(() => ({
  session: null,
  listener: null,
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(async () => ({ error: null })),
}))
vi.mock('./lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (callback) => {
        auth.listener = callback
        return { data: { subscription: { unsubscribe() {} } } }
      },
      resetPasswordForEmail: auth.resetPasswordForEmail,
      updateUser: auth.updateUser,
    },
  },
}))
vi.mock('./lib/push.js', () => ({ disablePush: vi.fn() }))
vi.mock('./ProfileSettings.jsx', () => ({ default: () => <h2>Profile details</h2> }))
vi.mock('./PartnerConnection.jsx', () => ({ default: () => <h2>Partner details</h2> }))
vi.mock('./WeekSchedule.jsx', () => ({ default: () => <h2>Week details</h2> }))
vi.mock('./NotificationSettings.jsx', () => ({ default: () => <h2>Notification details</h2> }))
afterEach(() => {
  cleanup()
  auth.session = null
  vi.clearAllMocks()
  localStorage.clear()
})
const open = () =>
  render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  )

test('forgot-password flow uses the allowlisted sign-in path and clear confirmation', async () => {
  open()
  fireEvent.click(await screen.findByRole('button', { name: 'Forgot password?' }))
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'test@example.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  await screen.findByRole('heading', { name: 'Check your inbox.' })
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
    redirectTo: expect.stringMatching(/\/signin$/),
  })
})

test('account navigation displays only the selected section', async () => {
  auth.session = { user: { id: 'test-user', email: 'test@example.com' } }
  open()
  await screen.findByRole('heading', { name: 'Profile details' })
  expect(screen.queryByRole('heading', { name: 'Partner details' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^Partner & week/ }))
  expect(screen.getByRole('heading', { name: 'Partner details' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Profile details' })).toBeNull()
})

test('recovery event opens password entry and rejects mismatched confirmation', async () => {
  open()
  await screen.findByRole('button', { name: 'Forgot password?' })
  auth.session = { user: { id: 'test-user', email: 'test@example.com' } }
  act(() => auth.listener('PASSWORD_RECOVERY', auth.session))
  await screen.findByRole('heading', { name: 'Choose a new password.' })
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'synthetic-test-only' },
  })
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: 'different-test-only' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  expect(screen.getByRole('alert').textContent).toContain('don’t match')
  expect(auth.updateUser).not.toHaveBeenCalled()
})
