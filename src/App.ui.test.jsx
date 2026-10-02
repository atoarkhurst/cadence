import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App.jsx'
import { useWeek } from './hooks/useWeek.js'
import { createIntention } from './lib/cadence.js'

vi.mock('./hooks/useWeek.js', () => ({ useWeek: vi.fn() }))
vi.mock('./lib/cadence.js', () => ({ createIntention: vi.fn(), setProgress: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderToday() {
  const setTasks = vi.fn()
  const setGoals = vi.fn()
  useWeek.mockReturnValue({
    workspace: {
      startsOn: '2026-09-26',
      weekId: 'week',
      user: { id: 'user' },
      displayName: 'Ato',
      partner: null,
      partnerItems: [],
    },
    tasks: [],
    goals: [],
    busy: false,
    status: 'ready',
    error: '',
    setTasks,
    setGoals,
    saveChange: async (action) => action(),
  })
  createIntention.mockResolvedValue('new-intention')
  render(<App />)
  return { setTasks, setGoals }
}

test('Today offers both one-time and counted intentions', () => {
  renderToday()
  fireEvent.click(screen.getByRole('button', { name: '+ Add an intention' }))
  expect(screen.getByRole('textbox', { name: 'One-time intention' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Count progress' }))
  expect(screen.getByRole('spinbutton', { name: 'Weekly target' })).toBeTruthy()
  expect(screen.queryByRole('textbox', { name: 'One-time intention' })).toBeNull()
})

test('a counted intention on Today saves to the shared weekly plan', async () => {
  const { setGoals } = renderToday()
  fireEvent.click(screen.getByRole('button', { name: '+ Add an intention' }))
  fireEvent.click(screen.getByRole('button', { name: 'Count progress' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Counted intention' }), {
    target: { value: 'Read 100 pages' },
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Weekly target' }), {
    target: { value: '100' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
  await waitFor(() =>
    expect(createIntention).toHaveBeenCalledWith('week', 'user', 'Read 100 pages', 'count', 100),
  )
  expect(setGoals).toHaveBeenCalledOnce()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '+ Add an intention' })).toBeTruthy(),
  )
})

test('a one-time intention on Today remains available', async () => {
  const { setTasks } = renderToday()
  fireEvent.click(screen.getByRole('button', { name: '+ Add an intention' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'One-time intention' }), {
    target: { value: 'Finish portfolio' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
  await waitFor(() =>
    expect(createIntention).toHaveBeenCalledWith('week', 'user', 'Finish portfolio', 'one_time'),
  )
  expect(setTasks).toHaveBeenCalledOnce()
})
