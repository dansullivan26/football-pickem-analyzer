import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeSeasonHistory } from '../src/seasonHistory.ts'

function dump() {
  return {
    source: {
      site: "CBS Sports Pick'em",
      fetchedAt: '2026-09-20T19:00:00.000Z',
      timezone: 'America/Indianapolis',
      privatePoolUrl: 'must not survive',
    },
    poolFamily: {
      currentPoolId: 'current',
      editions: [
        { seasonYear: 2025, poolId: 'pool-2025', seasonId: 'season-2025' },
        { seasonYear: 2024, poolId: 'pool-2024', seasonId: 'season-2024' },
      ],
      ignored: true,
    },
    seasons: [
      {
        seasonYear: 2024,
        poolId: 'pool-2024',
        seasonId: 'season-2024',
        periods: [],
        standings: [
          {
            name: 'rob bandelier',
            entryId: 'rob-2024',
            seasonScore: 233,
            rank: 1,
          },
        ],
      },
      {
        seasonYear: 2025,
        poolId: 'pool-2025',
        seasonId: 'season-2025',
        periods: [
          { id: 'w2', description: 'Week 2', order: 2, ignored: true },
          { id: 'w1', description: 'Week 1', order: 1 },
        ],
        standings: [
          {
            name: 'Dan Sullivan',
            entryId: 'dan-2025',
            seasonScore: 20,
            rank: 2,
            secret: 'drop this',
            weeklyWins: [
              {
                poolPeriodId: 'w2',
                week: 2,
                wins: 11,
                weeklyLeader: true,
              },
              {
                poolPeriodId: 'w1',
                week: 1,
                wins: 9,
                weeklyLeader: false,
              },
            ],
          },
          {
            name: 'Shawn Sedate',
            entryId: 'shawn-2025',
            seasonScore: 21,
            rank: 1,
            weeklyWins: [],
          },
        ],
      },
    ],
  }
}

test('sanitizeSeasonHistory allowlists, sorts, and retains season-specific ids', () => {
  const history = sanitizeSeasonHistory(dump())
  assert.deepEqual(
    history.seasons.map((season) => season.seasonYear),
    [2025, 2024],
  )
  assert.deepEqual(
    history.seasons[0]?.periods.map((period) => period.id),
    ['w1', 'w2'],
  )
  assert.deepEqual(
    history.seasons[0]?.standings.map((standing) => standing.name),
    ['Shawn Sedate', 'Dan Sullivan'],
  )
  assert.deepEqual(
    history.seasons[0]?.standings[1]?.weeklyWins.map((week) => week.week),
    [1, 2],
  )
  assert.equal(
    'privatePoolUrl' in (history.source as Record<string, unknown>),
    false,
  )
  assert.equal(
    'secret' in
      (history.seasons[0]?.standings[1] as unknown as Record<string, unknown>),
    false,
  )
})

test('sanitizeSeasonHistory permits totals-only archived seasons', () => {
  const history = sanitizeSeasonHistory(dump())
  assert.deepEqual(history.seasons[1]?.standings[0]?.weeklyWins, [])
})

test('sanitizeSeasonHistory rejects weekly rows for unknown periods', () => {
  const raw = dump()
  raw.seasons[1]!.standings[0]!.weeklyWins![0]!.poolPeriodId = 'missing'
  assert.throws(
    () => sanitizeSeasonHistory(raw),
    /references unknown period missing/,
  )
})

test('sanitizeSeasonHistory rejects duplicate display names within a season', () => {
  const raw = dump()
  raw.seasons[1]!.standings.push({
    name: 'Dan Sullivan',
    entryId: 'another-dan',
    seasonScore: 18,
    rank: 3,
    weeklyWins: [],
  })
  assert.throws(
    () => sanitizeSeasonHistory(raw),
    /2025 display names contains duplicates/,
  )
})
