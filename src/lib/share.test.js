import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeSnapshot, decodeSnapshot } from '../utils/share.js'

test('snapshots round-trip Unicode without treating encoded text as private', () => {
  const snapshot = {
    weekLabel: 'This week',
    weeklyGoals: {
      tasks: [{ id: '1', name: 'Read 📚', done: true }],
      goals: [{ id: '2', name: 'Run', target: 3, count: 1 }],
    },
  }
  assert.deepEqual(decodeSnapshot(encodeSnapshot(snapshot)), snapshot)
})
test('malformed and oversized snapshot shapes fail safely', () => {
  for (const value of [
    null,
    [],
    'hello',
    { weeklyGoals: null },
    { weeklyGoals: { tasks: 'wrong' } },
    { weekLabel: {} },
    { weeklyGoals: { tasks: [{ id: 1, name: {}, done: true }] } },
  ]) {
    assert.equal(decodeSnapshot(encodeSnapshot(value)), null)
  }
  assert.equal(decodeSnapshot('not-base64'), null)
  assert.equal(decodeSnapshot('x'.repeat(24001)), null)
})
