import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EncouragementHeart from './EncouragementHeart.jsx'
import { setEncouragementHeart } from './lib/cadence.js'
vi.mock('./lib/cadence.js', () => ({ setEncouragementHeart: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
test('saves explicit state, refreshes and supports undo', async () => {
  setEncouragementHeart.mockResolvedValue(undefined)
  const refresh = vi.fn()
  const { rerender } = render(
    <EncouragementHeart noteId="note" hearted={false} onChanged={refresh} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Send a heart' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(setEncouragementHeart).toHaveBeenCalledWith('note', true)
  rerender(<EncouragementHeart noteId="note" hearted={true} onChanged={refresh} />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove heart' }))
  await waitFor(() => expect(setEncouragementHeart).toHaveBeenLastCalledWith('note', false))
})
test('blocks repeated clicks while saving and reports failures without pretending success', async () => {
  let reject
  setEncouragementHeart.mockImplementation(
    () =>
      new Promise((_, no) => {
        reject = no
      }),
  )
  const refresh = vi.fn()
  render(<EncouragementHeart noteId="note" hearted={false} onChanged={refresh} />)
  const button = screen.getByRole('button', { name: 'Send a heart' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(setEncouragementHeart).toHaveBeenCalledTimes(1)
  reject(new Error('offline'))
  await screen.findByRole('status')
  expect(refresh).not.toHaveBeenCalled()
  expect(button.getAttribute('aria-pressed')).toBe('false')
})
