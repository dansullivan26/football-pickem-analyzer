import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergePickChangeLog,
  pickChangeForGame,
  readFirstSeenAt,
  sanitizePickChanges,
} from '../src/pickChanges.ts'
import { formatPickChangeCopy } from '../src/playerSnapshot.ts'

const dump = {
  week: 2,
  periodId: '2026-2',
  previousFetchedAt: '2026-09-12T22:10:00-04:00',
  fetchedAt: '2026-09-13T06:34:05-04:00',
  previousSnapshot: '/workspace/players-snapshots/secret.json',
  changes: [
    {
      entryId: 'dan',
      name: 'Dan',
      gameId: 'game-1',
      cbsEventId: 50029159,
      away: 'NE',
      home: 'SEA',
      changeType: 'flipped',
      from: { pickedSide: 'home', pickedTeamId: 'sea', pickedTeam: 'SEA' },
      to: { pickedSide: 'away', pickedTeamId: 'ne', pickedTeam: 'NE' },
      firstSeenAt: '2026-09-13T06:34:05-04:00',
      window: {
        after: '2026-09-12T22:10:00-04:00',
        atOrBefore: '2026-09-13T06:34:05-04:00',
      },
    },
  ],
}

test('sanitizePickChanges flattens this dump and drops local snapshot paths', () => {
  const rows = sanitizePickChanges(dump, dump.fetchedAt)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.changeType, 'flipped')
  assert.equal(rows[0]?.gameId, 'game-1')
  assert.equal(rows[0]?.previousFetchedAt, dump.previousFetchedAt)
  assert.equal(rows[0]?.fetchedAt, dump.fetchedAt)
  assert.equal(
    'previousSnapshot' in (rows[0] ?? {}),
    false,
  )
})

test('sanitizePickChanges accepts an empty change list', () => {
  assert.deepEqual(
    sanitizePickChanges(
      { week: 2, periodId: '2026-2', fetchedAt: dump.fetchedAt, changes: [] },
      dump.fetchedAt,
    ),
    [],
  )
})

test('mergePickChangeLog replaces the same dump instead of duplicating', () => {
  const first = sanitizePickChanges(dump, dump.fetchedAt)
  const again = sanitizePickChanges(
    {
      ...dump,
      changes: [
        {
          ...dump.changes[0],
          changeType: 'appeared',
          from: { pickedSide: null, pickedTeamId: null, pickedTeam: null },
        },
      ],
    },
    dump.fetchedAt,
  )
  const merged = mergePickChangeLog(mergePickChangeLog([], first), again)
  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.changeType, 'appeared')
})

test('pickChangeForGame returns the latest matching row', () => {
  const log = mergePickChangeLog(
    sanitizePickChanges(dump, dump.fetchedAt),
    sanitizePickChanges(
      {
        ...dump,
        fetchedAt: '2026-09-13T18:00:00-04:00',
        changes: [
          {
            ...dump.changes[0],
            changeType: 'cleared',
            to: { pickedSide: null, pickedTeamId: null, pickedTeam: null },
          },
        ],
      },
      '2026-09-13T18:00:00-04:00',
    ),
  )
  assert.equal(
    pickChangeForGame(log, 'dan', 'game-1')?.changeType,
    'cleared',
  )
  assert.equal(pickChangeForGame(log, 'dan', 'missing'), null)
})

test('readFirstSeenAt keeps null and rejects junk', () => {
  assert.equal(readFirstSeenAt(null), null)
  assert.equal(readFirstSeenAt(dump.fetchedAt), dump.fetchedAt)
  assert.throws(() => readFirstSeenAt('Tuesday'))
})

test('formatPickChangeCopy states the coarse dump window', () => {
  const row = sanitizePickChanges(dump, dump.fetchedAt)[0]
  assert.ok(row)
  assert.equal(
    formatPickChangeCopy(row, 'America/Indianapolis'),
    'Flipped between Sep 12, 10:10 PM EDT and Sep 13, 6:34 AM EDT',
  )
})
