import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mondayISO, nextWeek, validWeek } from './weeks.js'
test('Sunday and Monday resolve to the intended local week', () => {
  assert.equal(mondayISO(new Date(2026, 8, 27, 23, 59)), '2026-09-21')
  assert.equal(mondayISO(new Date(2026, 8, 28, 0, 1)), '2026-09-28')
})
test('next week crosses years and daylight saving boundaries', () => {
  assert.equal(nextWeek('2026-12-28'), '2027-01-04')
  assert.equal(nextWeek('2026-03-02'), '2026-03-09')
})
test('invalid and non-Monday dates cannot be used as week keys', () => {
  assert.equal(validWeek('2026-09-21'), true)
  for (const input of ['2026-09-22', '2026-02-30', 'nonsense', null]) assert.equal(validWeek(input), false)
})
