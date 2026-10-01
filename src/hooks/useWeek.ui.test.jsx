import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useWeek } from './useWeek.js'
import { loadCurrentWeek } from '../lib/cadence.js'
vi.mock('../lib/cadence.js', () => ({ loadCurrentWeek: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const week = (count) => ({ tasks: [{ id: 'goal', count, done: count > 0 }], goals: [], cheers: [] })

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
  act(() => window.dispatchEvent(new Event('focus')))
  await waitFor(() => expect(result.current.tasks[0].count).toBe(1))
})
