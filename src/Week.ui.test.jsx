import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Week from './Week.jsx'
import { useWeek } from './hooks/useWeek.js'

vi.mock('./hooks/useWeek.js', () => ({ useWeek: vi.fn() }))
vi.mock('./lib/cadence.js', () => ({
  createEncouragement: vi.fn(),
  createIntention: vi.fn(),
  createInvitation: vi.fn(),
  removeIntention: vi.fn(),
  setProgress: vi.fn(),
  setEncouragementHeart: vi.fn(),
}))
vi.mock('./PartnerInvitations.jsx', () => ({ default: () => <p>Check invitations</p> }))
afterEach(cleanup)

function renderWeek(past = false) {
  useWeek.mockReturnValue({
    workspace: {
      startsOn: past ? '2026-09-19' : '2026-09-26',
      currentStartsOn: '2026-09-26',
      nextStartsOn: '2026-10-03',
      schedule: { start_day: 6 },
      user: { id: 'me' },
      partner: { id: 'partner', display_name: 'Joey' },
      partnerItems: [],
    },
    tasks: [{ id: 'task', name: 'Finish lesson', done: false }],
    goals: [],
    cheers: [{ id: 'note', author_id: 'partner', author: 'Joey', message: 'You got this!' }],
    status: 'ready',
    busy: false,
    error: '',
    refreshWeek: vi.fn(),
    saveChange: vi.fn(),
  })
  return render(<Week />)
}

test('secondary navigation remains available in the week disclosure', () => {
  const { container } = renderWeek()
  const options = container.querySelector('details')
  expect(options.open).toBe(false)
  fireEvent.click(screen.getByText('Week options'))
  expect(options.open).toBe(true)
  expect(within(options).getByRole('link', { name: 'History' }).getAttribute('href')).toContain(
    '/review',
  )
  expect(
    within(options)
      .getByRole('link', { name: /Plan the following/ })
      .getAttribute('href'),
  ).toContain('2026-10-03')
})

test('received encouragement stays with own intentions and goal entry remains accessible', () => {
  const { container } = renderWeek()
  expect(
    within(container.querySelector('.intentions-panel')).getByText('You got this!'),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '+ Add an intention', exact: true }))
  expect(screen.getByRole('textbox', { name: 'One-time intention' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Count progress' }))
  expect(screen.getByRole('spinbutton', { name: 'Weekly target' })).toBeTruthy()
  expect(screen.queryByRole('textbox', { name: 'One-time intention' })).toBeNull()
})

test('past weeks keep history read-only', () => {
  renderWeek(true)
  expect(screen.queryByRole('button', { name: '+ Add an intention', exact: true })).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Mark Finish lesson complete' }).closest('fieldset')
      .disabled,
  ).toBe(true)
  expect(
    screen.getByRole('button', { name: 'Send encouragement' }).closest('fieldset').disabled,
  ).toBe(true)
})
