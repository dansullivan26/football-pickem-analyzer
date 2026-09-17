import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPickChangeCopy,
  formatPicksCountStartCopy,
  formatPicksSnapshotAt,
} from '../src/playerSnapshot.ts'

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

test('formatPickChangeCopy names a first-dump appearance', () => {
  assert.equal(
    formatPickChangeCopy(
      {
        changeType: 'appeared',
        window: { after: null, atOrBefore: '2026-09-13T06:34:05-04:00' },
      },
      'America/Indianapolis',
    ),
    'Appeared in the Sep 13, 6:34 AM EDT dump',
  )
})

test('formats a coarse first-submit window', () => {
  assert.equal(
    formatPicksCountStartCopy(
      {
        window: {
          after: '2026-09-12T22:10:00-04:00',
          atOrBefore: '2026-09-13T06:34:05-04:00',
        },
      },
      null,
      'America/Indianapolis',
    ),
    'Started between Sep 12, 10:10 PM EDT and Sep 13, 6:34 AM EDT',
  )
  assert.equal(
    formatPicksCountStartCopy(
      null,
      '2026-09-13T06:34:05-04:00',
      'America/Indianapolis',
    ),
    'Started by Sep 13, 6:34 AM EDT',
  )
})
