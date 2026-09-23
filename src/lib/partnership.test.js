import { test } from 'node:test'
import assert from 'node:assert/strict'
import { choosePartnership, isComplete } from './partnership.js'

test('both partners select the shared workspace despite newer solo memberships', () => {
  const members = [
    { user_id: 'alice', partnership_id: 'solo-a' },
    { user_id: 'bob', partnership_id: 'solo-b' },
    { user_id: 'alice', partnership_id: 'shared' },
    { user_id: 'bob', partnership_id: 'shared' },
  ]
  assert.equal(choosePartnership(members, 'alice').partnership_id, 'shared')
  assert.equal(choosePartnership(members.toReversed(), 'bob').partnership_id, 'shared')
  assert.equal(choosePartnership(members, 'outsider'), null)
})
test('reciprocal invitations select the same workspace regardless of row order', () => {
  const members = ['alice', 'bob'].flatMap(user_id => ['pair-a', 'pair-b'].map(partnership_id => ({ user_id, partnership_id })))
  assert.equal(choosePartnership(members, 'alice').partnership_id, choosePartnership(members.toReversed(), 'bob').partnership_id)
})
test('partial count progress and unchecked one-time goals are not completed', () => {
  assert.equal(isComplete({ kind: 'count', count: 2, target: 4, done: true }), false)
  assert.equal(isComplete({ kind: 'count', count: 4, target: 4 }), true)
  assert.equal(isComplete({ kind: 'one_time', count: 0, target: null, done: false }), false)
  assert.equal(isComplete({ kind: 'one_time', done: true }), true)
})
