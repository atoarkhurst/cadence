import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App.jsx'
import { useWeek } from './hooks/useWeek.js'
import { createIntention, updateIntention } from './lib/cadence.js'

vi.mock('./hooks/useWeek.js', () => ({ useWeek: vi.fn() }))
vi.mock('./lib/cadence.js', () => ({
  createIntention: vi.fn(),
  setProgress: vi.fn(),
  updateIntention: vi.fn(),
  removeIntention: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderToday({ tasks = [], goals = [] } = {}) {
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
    tasks,
    goals,
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
  expect(screen.getByText('How many this week?')).toBeTruthy()
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

test('editing a counted goal on Today preserves progress and updates the shared intention', async () => {
  const goal = { id: 'reading', name: 'Read pages', target: 100, count: 24, kind: 'count' }
  const { setGoals } = renderToday({ goals: [goal] })
  fireEvent.click(screen.getByLabelText('Options for Read pages'))
  fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }))
  fireEvent.change(screen.getByLabelText('Edit goal name'), { target: { value: 'Read my book' } })
  fireEvent.change(screen.getByLabelText('Edit weekly amount'), { target: { value: '80' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(setGoals).toHaveBeenCalledOnce())
  expect(updateIntention).toHaveBeenCalledWith(
    { id: 'reading', name: 'Read pages', target: 100, kind: 'count' },
    'user',
    'Read my book',
    80,
  )
  expect(setGoals.mock.calls[0][0]([goal])).toEqual([{ ...goal, name: 'Read my book', target: 80 }])
})

test('editing a completed one-time goal retains completion; cancel does not save', async () => {
  const task = { id: 'task', name: 'Send application', done: true, count: 1, kind: 'one_time' }
  const { setTasks } = renderToday({ tasks: [task] })
  fireEvent.click(screen.getByLabelText('Options for Send application'))
  fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }))
  fireEvent.change(screen.getByLabelText('Edit goal name'), { target: { value: 'Discard this' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(updateIntention).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('Options for Send application'))
  fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }))
  fireEvent.change(screen.getByLabelText('Edit goal name'), {
    target: { value: 'Send portfolio application' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(setTasks).toHaveBeenCalledOnce())
  expect(setTasks.mock.calls[0][0]([task])).toEqual([
    { ...task, name: 'Send portfolio application', target: null },
  ])
})
