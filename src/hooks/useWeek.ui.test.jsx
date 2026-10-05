import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useWeek } from './useWeek.js'
import { loadCurrentWeek } from '../lib/cadence.js'
import { weekStore } from '../lib/week-store.js'
import { currentWeek, nextWeek } from '../lib/weeks.js'
vi.mock('../lib/cadence.js', () => ({ loadCurrentWeek: vi.fn() }))
beforeEach(() => weekStore.setUser('user'))
afterEach(() => {
  cleanup()
  weekStore.setUser(undefined)
  vi.resetAllMocks()
})
const week = (count, extra = {}) => ({
  user: { id: 'user' },
  currentStartsOn: currentWeek(),
  startsOn: currentWeek(),
  tasks: [{ id: 'goal', count, done: count > 0 }],
  goals: [],
  cheers: [],
  ...extra,
})

test('a refresh started before a save cannot overwrite the saved result', async () => {
  let finishOld
  loadCurrentWeek.mockResolvedValueOnce(week(0))
  const { result } = renderHook(() => useWeek())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  loadCurrentWeek.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve
      }),
  )
  let oldRequest
  act(() => {
    oldRequest = result.current.refreshWeek()
  })
  loadCurrentWeek.mockResolvedValueOnce(week(1))
  await act(async () => {
    await result.current.saveChange(async () => {})
  })
  await act(async () => {
    finishOld(week(0))
    await oldRequest
  })
  expect(result.current.tasks[0].count).toBe(1)
})

test('conflicts surface clearly and reload server truth without losing input state', async () => {
  loadCurrentWeek.mockResolvedValueOnce(week(1))
  const { result } = renderHook(() => useWeek())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  loadCurrentWeek.mockResolvedValueOnce(week(2))
  await act(async () => {
    await result.current.saveChange(async () => {
      throw new Error('Progress changed on another device.')
    })
  })
  expect(result.current.error).toContain('another device')
  expect(result.current.tasks[0].count).toBe(2)
  expect(result.current.busy).toBe(false)
})

test('focus refresh updates the daily dashboard too', async () => {
  loadCurrentWeek.mockResolvedValueOnce(week(0))
  const { result } = renderHook(() => useWeek())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  loadCurrentWeek.mockResolvedValueOnce(week(1))
  weekStore.getEntry().updatedAt = Date.now() - 15000
  act(() => window.dispatchEvent(new Event('focus')))
  await waitFor(() => expect(result.current.tasks[0].count).toBe(1))
})

test('switching dashboards reuses the current week without another loading screen or request', async () => {
  loadCurrentWeek.mockResolvedValue(week(3))
  const first = renderHook(() => useWeek())
  await waitFor(() => expect(first.result.current.status).toBe('ready'))
  first.unmount()
  const second = renderHook(() => useWeek())
  expect(second.result.current.status).toBe('ready')
  expect(second.result.current.tasks[0].count).toBe(3)
  expect(loadCurrentWeek).toHaveBeenCalledTimes(1)
})

test('returning to an older cached view keeps it visible while one background request refreshes it', async () => {
  loadCurrentWeek.mockResolvedValueOnce(week(1))
  const first = renderHook(() => useWeek())
  await waitFor(() => expect(first.result.current.status).toBe('ready'))
  first.unmount()
  weekStore.getEntry().updatedAt = Date.now() - 15000
  let finish
  loadCurrentWeek.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const second = renderHook(() => useWeek())
  expect(second.result.current.status).toBe('ready')
  expect(second.result.current.tasks[0].count).toBe(1)
  act(() => window.dispatchEvent(new Event('focus')))
  expect(loadCurrentWeek).toHaveBeenCalledTimes(2)
  await act(async () => finish(week(2)))
  expect(second.result.current.tasks[0].count).toBe(2)
})

test('a save completes across navigation and an old read cannot overwrite it', async () => {
  loadCurrentWeek.mockResolvedValueOnce(week(0))
  const first = renderHook(() => useWeek())
  await waitFor(() => expect(first.result.current.status).toBe('ready'))
  let finishSave
  let saving
  act(() => {
    saving = first.result.current.saveChange(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
  })
  first.unmount()
  const second = renderHook(() => useWeek())
  expect(second.result.current.busy).toBe(true)
  loadCurrentWeek.mockResolvedValueOnce(week(1))
  await act(async () => {
    finishSave()
    await saving
  })
  expect(second.result.current.tasks[0].count).toBe(1)
  expect(second.result.current.busy).toBe(false)
})

test('changing accounts clears cached data and rejects a late response from the old account', async () => {
  loadCurrentWeek.mockResolvedValueOnce(week(1))
  const view = renderHook(() => useWeek())
  await waitFor(() => expect(view.result.current.status).toBe('ready'))
  let finishOld
  loadCurrentWeek.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve
      }),
  )
  act(() => {
    void view.result.current.refreshWeek()
  })
  act(() => weekStore.setUser(null))
  expect(view.result.current.status).toBe('signed-out')
  expect(view.result.current.tasks).toEqual([])
  loadCurrentWeek.mockResolvedValueOnce(week(8, { user: { id: 'other' } }))
  act(() => weekStore.setUser('other'))
  expect(view.result.current.workspace).toBeNull()
  await waitFor(() => expect(view.result.current.tasks[0]?.count).toBe(8))
  await act(async () => finishOld(week(1)))
  expect(view.result.current.workspace.user.id).toBe('other')
  expect(view.result.current.tasks[0].count).toBe(8)
})

test('different weeks never share a snapshot and invalidation clears partnership data', async () => {
  const next = nextWeek(currentWeek())
  loadCurrentWeek.mockImplementation(async (start) =>
    week(start ? 5 : 1, { startsOn: start || currentWeek() }),
  )
  const view = renderHook(({ start }) => useWeek(start), { initialProps: { start: null } })
  await waitFor(() => expect(view.result.current.status).toBe('ready'))
  view.rerender({ start: next })
  expect(view.result.current.workspace).toBeNull()
  await waitFor(() => expect(view.result.current.workspace?.startsOn).toBe(next))
  view.rerender({ start: null })
  expect(view.result.current.tasks[0].count).toBe(1)
  loadCurrentWeek.mockImplementation(() => new Promise(() => {}))
  act(() => weekStore.invalidate())
  expect(view.result.current.workspace).toBeNull()
  expect(view.result.current.status).toBe('loading')
})

test('a new shared week discards the old current-week cache', async () => {
  loadCurrentWeek.mockResolvedValueOnce(week(1))
  const first = renderHook(() => useWeek())
  await waitFor(() => expect(first.result.current.status).toBe('ready'))
  first.unmount()
  const cached = weekStore.getEntry()
  cached.snapshot = {
    ...cached.snapshot,
    workspace: { ...cached.snapshot.workspace, currentStartsOn: '2020-01-06' },
  }
  loadCurrentWeek.mockImplementation(() => new Promise(() => {}))
  const second = renderHook(() => useWeek())
  expect(second.result.current.status).toBe('loading')
  expect(second.result.current.tasks).toEqual([])
})
