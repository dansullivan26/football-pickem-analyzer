import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergePickChangeLog,
  pickChangeForGame,
  pickChangeVsPrediction,
  picksCountStartChange,
  picksCountCompletionChange,
  readFirstSeenAt,
  sanitizePickChanges,
  sanitizePicksCountChanges,
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

test('sanitizes and finds the first submitted-count change', () => {
  const rows = sanitizePicksCountChanges(
    {
      ...dump,
      picksCountChanges: [
        {
          entryId: 'dan',
          name: 'Dan',
          changeType: 'picksCount',
          from: 0,
          to: 1,
          picksCountFirstSeenAt: dump.fetchedAt,
          window: {
            after: dump.previousFetchedAt,
            atOrBefore: dump.fetchedAt,
          },
        },
      ],
    },
    dump.fetchedAt,
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.to, 1)
  assert.equal(picksCountStartChange(rows, 2, 'dan'), rows[0])
  assert.equal(picksCountStartChange(rows, 2, 'missing'), null)
  assert.equal(picksCountCompletionChange(rows, 2, 'dan', 1), rows[0])
  assert.equal(picksCountCompletionChange(rows, 2, 'dan', 25), null)
})

test('sanitizePicksCountChanges rejects invalid counts', () => {
  assert.throws(() =>
    sanitizePicksCountChanges(
      {
        ...dump,
        picksCountChanges: [
          {
            entryId: 'dan',
            changeType: 'picksCount',
            from: 0,
            to: -1,
          },
        ],
      },
      dump.fetchedAt,
    ),
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

const dogRead = {
  predictedSide: 'away' as const,
  habitKey: 'favorite' as const,
  reason: 'Favorite/dog habit · 25 prior chances',
}

test('pickChangeVsPrediction stays silent without a weekly call', () => {
  const row = sanitizePickChanges(dump, dump.fetchedAt)[0]
  assert.ok(row)
  assert.equal(
    pickChangeVsPrediction(row, {
      predictedSide: null,
      habitKey: null,
      reason: 'Habits conflict or remain too close to 50/50',
    }),
    null,
  )
  assert.equal(pickChangeVsPrediction(row, null), null)
})

test('pickChangeVsPrediction stays silent on a cleared pick', () => {
  assert.equal(
    pickChangeVsPrediction(
      {
        changeType: 'cleared',
        from: { pickedSide: 'home', pickedTeamId: 'sea', pickedTeam: 'SEA' },
        to: { pickedSide: null, pickedTeamId: null, pickedTeam: null },
      },
      dogRead,
    ),
    null,
  )
})

test('pickChangeVsPrediction labels appear and flip against the weekly read', () => {
  assert.deepEqual(
    pickChangeVsPrediction(
      {
        changeType: 'appeared',
        from: { pickedSide: null, pickedTeamId: null, pickedTeam: null },
        to: { pickedSide: 'away', pickedTeamId: 'ne', pickedTeam: 'NE' },
      },
      dogRead,
    ),
    {
      kind: 'appeared-on',
      aligned: true,
      copy: 'Landed on their favorite/dog read.',
    },
  )
  assert.equal(
    pickChangeVsPrediction(
      {
        changeType: 'appeared',
        from: { pickedSide: null, pickedTeamId: null, pickedTeam: null },
        to: { pickedSide: 'home', pickedTeamId: 'sea', pickedTeam: 'SEA' },
      },
      dogRead,
    )?.copy,
    'Landed against their favorite/dog read.',
  )

  const flip = sanitizePickChanges(dump, dump.fetchedAt)[0]
  assert.ok(flip)
  assert.deepEqual(pickChangeVsPrediction(flip, dogRead), {
    kind: 'flipped-on',
    aligned: true,
    copy: 'Flipped onto their favorite/dog read.',
  })
  assert.deepEqual(
    pickChangeVsPrediction(flip, {
      predictedSide: 'home',
      habitKey: 'line-value',
      reason: 'Line-value habit · 17 prior chances',
    }),
    {
      kind: 'flipped-off',
      aligned: false,
      copy: 'Flipped off their line-value read.',
    },
  )
  assert.deepEqual(
    pickChangeVsPrediction(
      {
        changeType: 'flipped',
        from: { pickedSide: null, pickedTeamId: null, pickedTeam: null },
        to: { pickedSide: 'home', pickedTeamId: 'sea', pickedTeam: 'SEA' },
      },
      dogRead,
    ),
    {
      kind: 'flipped-still-off',
      aligned: false,
      copy: 'Moved, still against their favorite/dog read.',
    },
  )
})

test('pickChangeVsPrediction falls back to the reason when a habit key is missing', () => {
  const flip = sanitizePickChanges(dump, dump.fetchedAt)[0]
  assert.ok(flip)
  assert.equal(
    pickChangeVsPrediction(flip, {
      predictedSide: 'away',
      habitKey: null,
      reason: 'Line-value habit + travel habit · 16 prior chances',
    })?.copy,
    'Flipped onto their line-value + travel read.',
  )
})
