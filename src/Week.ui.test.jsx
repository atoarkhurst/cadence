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

function renderWeek(past = false, cheers = null, partnerItems = []) {
  useWeek.mockReturnValue({
    workspace: {
      startsOn: past ? '2026-09-19' : '2026-09-26',
      currentStartsOn: '2026-09-26',
      nextStartsOn: '2026-10-03',
      schedule: { start_day: 6 },
      user: { id: 'me' },
      partner: { id: 'partner', display_name: 'Joey' },
      partnerItems,
    },
    tasks: [{ id: 'task', name: 'Finish lesson', done: false }],
    goals: [],
    cheers: cheers ?? [
      { id: 'note', author_id: 'partner', author: 'Joey', message: 'You got this!' },
    ],
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

test('partner tasks stay distinct from counted progress without repeated empty tracks', () => {
  const { container } = renderWeek(false, null, [
    { id: 'first', name: 'Go to the gym', kind: 'one_time', done: false },
    { id: 'second', name: 'Plan meals', kind: 'one_time', done: true },
    { id: 'third', name: 'Read pages', kind: 'count', count: 2, target: 5 },
  ])
  const partner = container.querySelector('.partner-panel')
  expect(within(partner).getByText('In your corner')).toBeTruthy()
  expect(within(partner).getByText('Go to the gym')).toBeTruthy()
  expect(within(partner).getByText('Done ✓')).toBeTruthy()
  expect(within(partner).getByText('2 / 5')).toBeTruthy()
  expect(partner.querySelectorAll('.partner-goal .mini-track')).toHaveLength(1)
  expect(within(partner).queryByText('Not yet')).toBeNull()
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

test('many notes keep the latest encouragement visible and the send field reachable', () => {
  const { container } = renderWeek(false, [
    { id: 'latest', author_id: 'partner', author: 'Joey', message: 'Newest encouragement' },
    { id: 'sent-latest', author_id: 'me', message: 'Most recent note to Joey' },
    { id: 'older', author_id: 'partner', author: 'Joey', message: 'Earlier encouragement' },
    { id: 'sent-older', author_id: 'me', message: 'Earlier note to Joey' },
  ])
  const received = container.querySelector('.intentions-panel .encouragement-section')
  expect(within(received).getByText('Newest encouragement')).toBeTruthy()
  const receivedHistory = within(received)
    .getByText('View 1 earlier notes from Joey')
    .closest('details')
  expect(receivedHistory.open).toBe(false)
  fireEvent.click(within(receivedHistory).getByText('View 1 earlier notes from Joey'))
  expect(receivedHistory.open).toBe(true)
  expect(within(receivedHistory).getByText('Earlier encouragement')).toBeTruthy()

  const sent = container.querySelector('.partner-panel .encouragement-section')
  const form = sent.querySelector('.cheer-form')
  const lastSent = sent.querySelector('.latest-sent-note')
  expect(form.compareDocumentPosition(lastSent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(lastSent).getByText('Most recent note to Joey')).toBeTruthy()
  expect(sent.querySelector('.sent-history').open).toBe(false)
})

test('a long featured note can be opened without hiding its full text', () => {
  const message = 'Keep showing up for the work that matters to you. '.repeat(5)
  const { container } = renderWeek(false, [
    { id: 'long', author_id: 'partner', author: 'Joey', message },
  ])
  const featured = container.querySelector('.featured-note')
  expect(featured.querySelector('.note-excerpt')).toBeTruthy()
  fireEvent.click(within(featured).getByRole('button', { name: 'Read full note' }))
  expect(featured.querySelector('.note-excerpt')).toBeNull()
  expect(featured.querySelector('.note-content > p').textContent).toBe(message)
})
