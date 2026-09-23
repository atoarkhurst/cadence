import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanDisplayName } from './profile.js'

test('display names support real names and trim extra whitespace', () => {
  assert.equal(cleanDisplayName('  Ato   Parkhurst  '), 'Ato Parkhurst')
  assert.equal(cleanDisplayName('Joey'), 'Joey')
  assert.equal(cleanDisplayName('Zoë 李'), 'Zoë 李')
})
test('blank and oversized names cannot be saved', () => {
  assert.throws(() => cleanDisplayName('   '), /Enter a name/)
  assert.throws(() => cleanDisplayName('a'.repeat(61)), /60/)
})
