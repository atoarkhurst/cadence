import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import App from './App.jsx'
import Week from './Week.jsx'
import { loadCurrentWeek } from './lib/cadence.js'
import { weekStore } from './lib/week-store.js'
import { currentWeek, nextWeek } from './lib/weeks.js'

vi.mock('./lib/cadence.js', () => ({
  loadCurrentWeek: vi.fn(),
  createIntention: vi.fn(),
  createInvitation: vi.fn(),
  createEncouragement: vi.fn(),
  setProgress: vi.fn(),
  removeIntention: vi.fn(),
  updateIntention: vi.fn(),
  setEncouragementHeart: vi.fn(),
}))
vi.mock('./PartnerInvitations.jsx', () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  weekStore.setUser(undefined)
  vi.resetAllMocks()
})

test('the real Today-to-week link navigates in place and reuses the loaded plan', async () => {
  weekStore.setUser('me')
  loadCurrentWeek.mockResolvedValue({
    user: { id: 'me' },
    weekId: 'week',
    startsOn: currentWeek(),
    currentStartsOn: currentWeek(),
    nextStartsOn: nextWeek(currentWeek()),
    displayName: 'Ato',
    schedule: { start_day: 1 },
    partner: null,
    partnerItems: [],
    tasks: [{ id: 'task', name: 'Read a chapter', done: false, kind: 'one_time' }],
    goals: [],
    cheers: [],
  })
  render(
    <MemoryRouter basename="/cadence" initialEntries={['/cadence/']}>
      <Link to="/">Today tab</Link>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/week" element={<Week />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: 'Keep going.' })
  const link = screen.getByRole('link', { name: 'See the full week →' })
  expect(link.getAttribute('href')).toBe('/cadence/week')
  fireEvent.click(link)
  expect(screen.getByRole('button', { name: 'Mark Read a chapter complete' })).toBeTruthy()
  expect(screen.queryByText('Loading your week…')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Today tab' }))
  expect(screen.getByRole('heading', { name: 'Keep going.' })).toBeTruthy()
  expect(screen.queryByText('Loading your day…')).toBeNull()
  expect(loadCurrentWeek).toHaveBeenCalledTimes(1)
})
