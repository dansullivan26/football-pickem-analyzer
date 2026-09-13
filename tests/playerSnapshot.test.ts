import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPicksSnapshotAt } from '../src/playerSnapshot.ts'

test('formats a players dump timestamp in the source time zone', () => {
  assert.equal(
    formatPicksSnapshotAt(
      '2026-09-13T06:34:05-04:00',
      'America/Indianapolis',
    ),
    'Sep 13, 6:34 AM EDT',
  )
})

test('falls back safely for invalid timestamps and time zones', () => {
  assert.equal(formatPicksSnapshotAt('not-a-date'), 'Unknown')
  assert.equal(
    formatPicksSnapshotAt('2026-09-13T06:34:05-04:00', 'Not/A_Zone'),
    'Sep 13, 6:34 AM EDT',
  )
})
