import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeHistoricalPeriods,
  currentMoneyPace,
  currentStandings,
  finalMoneyLine,
  historicalWeeklyBenchmarks,
  moneyPaceForSeason,
  playerMoneyPaceComparison,
  returningMoneyFinishers,
} from '../src/leagueHistory.ts'
import type {
  HistoricalSeason,
  SeasonHistoryFile,
} from '../src/seasonHistory.ts'
import type {
  PlayerHistory,
  PlayerRosterEntry,
  PlayerWeek,
  PlayerWeekEntry,
} from '../src/types.ts'

function season(): HistoricalSeason {
  const scores = [
    { name: 'Alpha', entryId: 'a', rank: 1, seasonScore: 12, scores: [0, 7, 5] },
    { name: 'Beta', entryId: 'b', rank: 2, seasonScore: 10, scores: [0, 6, 4] },
    { name: 'Gamma', entryId: 'c', rank: 3, seasonScore: 8, scores: [0, 4, 4] },
    { name: 'Delta', entryId: 'd', rank: 4, seasonScore: 7, scores: [0, 5, 2] },
  ]
  return {
    seasonYear: 2025,
    poolId: 'pool',
    seasonId: 'season',
    periods: [1, 2, 3].map((order) => ({
      id: `w${order}`,
      description: `Week ${order}`,
      order,
    })),
    standings: scores.map((standing) => ({
      name: standing.name,
      entryId: standing.entryId,
      rank: standing.rank,
      seasonScore: standing.seasonScore,
      weeklyWins: standing.scores.map((wins, index) => ({
        poolPeriodId: `w${index + 1}`,
        week: index + 1,
        wins,
      })),
    })),
  }
}

function rosterEntry(entryId: string, name: string): PlayerRosterEntry {
  return {
    entryId,
    name,
    hasMadeAPick: true,
    season: {
      score: null,
      rank: null,
      correctPicks: null,
      picksMadeCount: null,
    },
  }
}

function weekEntry(
  entryId: string,
  name: string,
  score: number,
): PlayerWeekEntry {
  return {
    entryId,
    name,
    weekScore: score,
    weekRank: null,
    correctPicks: score,
    picksCount: 25,
    tiebreaker: { question: null, answer: null },
    picks: [],
  }
}

function week(
  weekNumber: number,
  scored: boolean,
  scores: Array<[string, string, number]>,
): PlayerWeek {
  return {
    week: weekNumber,
    periodId: `w${weekNumber}`,
    label: `Week ${weekNumber}`,
    status: scored ? 'scored' : 'in_progress',
    scored,
    slateFile: '',
    entries: scores.map(([entryId, name, score]) =>
      weekEntry(entryId, name, score),
    ),
  }
}

function currentHistory(): PlayerHistory {
  const entries = [
    rosterEntry('a-now', 'Alpha'),
    rosterEntry('b-now', 'Beta'),
    rosterEntry('c-now', 'Gamma'),
    rosterEntry('x-now', 'Other'),
  ]
  return {
    source: { fetchedAt: '', timezone: 'America/Indianapolis' },
    pool: { name: 'Pool', seasonYear: 2026 },
    entries,
    weeks: [
      week(1, true, [
        ['a-now', 'Alpha', 6],
        ['b-now', 'Beta', 5],
        ['c-now', 'Gamma', 4],
        ['x-now', 'Other', 7],
      ]),
      week(2, true, [
        ['a-now', 'Alpha', 5],
        ['b-now', 'Beta', 5],
        ['c-now', 'Gamma', 6],
        ['x-now', 'Other', 2],
      ]),
      week(3, false, [
        ['a-now', 'Alpha', 20],
        ['b-now', 'Beta', 20],
        ['c-now', 'Gamma', 20],
        ['x-now', 'Other', 20],
      ]),
    ],
  }
}

function archive(): SeasonHistoryFile {
  return {
    source: { site: 'CBS', fetchedAt: '', timezone: 'America/Indianapolis' },
    poolFamily: {
      currentPoolId: 'current',
      editions: [
        { seasonYear: 2025, poolId: 'pool', seasonId: 'season' },
      ],
    },
    seasons: [season()],
  }
}

test('money pace skips an all-zero CBS period and accumulates active weeks', () => {
  const historical = season()
  assert.deepEqual(
    activeHistoricalPeriods(historical).map((period) => period.order),
    [2, 3],
  )
  assert.deepEqual(moneyPaceForSeason(historical), [
    {
      activeWeek: 1,
      periodOrder: 2,
      periodLabel: 'Week 2',
      thirdPlaceScore: 5,
      leaderScore: 7,
    },
    {
      activeWeek: 2,
      periodOrder: 3,
      periodLabel: 'Week 3',
      thirdPlaceScore: 8,
      leaderScore: 12,
    },
  ])
  assert.equal(finalMoneyLine(historical), 8)
})

test('weekly benchmarks report score distribution, not official winners', () => {
  assert.deepEqual(historicalWeeklyBenchmarks(archive())[0], {
    seasonYear: 2025,
    activeWeek: 1,
    periodOrder: 2,
    periodLabel: 'Week 2',
    highScore: 7,
    thirdScore: 5,
    medianScore: 5.5,
    coHighCount: 1,
  })
})

test('current standings and pace include completed weeks only', () => {
  const history = currentHistory()
  assert.deepEqual(
    currentStandings(history).map(({ name, score, rank }) => ({
      name,
      score,
      rank,
    })),
    [
      { name: 'Alpha', score: 11, rank: 1 },
      { name: 'Beta', score: 10, rank: 2 },
      { name: 'Gamma', score: 10, rank: 2 },
      { name: 'Other', score: 9, rank: 4 },
    ],
  )
  assert.deepEqual(
    currentMoneyPace(history).map((point) => point.thirdPlaceScore),
    [5, 10],
  )
})

test('player money pace compares the same checkpoint with eventual cashers', () => {
  const comparison = playerMoneyPaceComparison(
    archive(),
    currentHistory(),
    'a-now',
  )
  assert.ok(comparison)
  assert.deepEqual(
    {
      activeWeek: comparison.activeWeek,
      current: comparison.current,
      currentMoneyLine: comparison.currentMoneyLine,
      gapToCurrentMoneyLine: comparison.gapToCurrentMoneyLine,
      cashersAtOrBelow: comparison.cashersAtOrBelow,
      cashersTotal: comparison.cashersTotal,
      cashPaceMedian: comparison.cashPaceMedian,
      gapToCashPaceMedian: comparison.gapToCashPaceMedian,
    },
    {
      activeWeek: 2,
      current: { entryId: 'a-now', name: 'Alpha', score: 11, rank: 1 },
      currentMoneyLine: 10,
      gapToCurrentMoneyLine: 1,
      cashersAtOrBelow: 2,
      cashersTotal: 3,
      cashPaceMedian: 10,
      gapToCashPaceMedian: 1,
    },
  )
  assert.deepEqual(comparison.seasons, [
    {
      seasonYear: 2025,
      periodOrder: 3,
      periodLabel: 'Week 3',
      equivalentRank: 2,
      thirdPlaceScore: 8,
      gapToThird: 3,
      cashers: [
        {
          name: 'Alpha',
          place: 1,
          checkpointScore: 12,
          finalScore: 12,
          gap: -1,
        },
        {
          name: 'Beta',
          place: 2,
          checkpointScore: 10,
          finalScore: 10,
          gap: 1,
        },
        {
          name: 'Gamma',
          place: 3,
          checkpointScore: 8,
          finalScore: 8,
          gap: 3,
        },
      ],
    },
  ])
  assert.equal(
    playerMoneyPaceComparison(archive(), currentHistory(), 'missing'),
    null,
  )
})

test('returning money finishers join by normalized display name', () => {
  const history = currentHistory()
  history.entries[0]!.name = 'Alpha  '
  const returning = returningMoneyFinishers(archive(), history)
  assert.deepEqual(
    returning.map((player) => ({
      name: player.name,
      finishes: player.finishes,
      score: player.current?.score,
    })),
    [
      {
        name: 'Alpha  ',
        finishes: [{ seasonYear: 2025, place: 1, score: 12 }],
        score: 11,
      },
      {
        name: 'Beta',
        finishes: [{ seasonYear: 2025, place: 2, score: 10 }],
        score: 10,
      },
      {
        name: 'Gamma',
        finishes: [{ seasonYear: 2025, place: 3, score: 8 }],
        score: 10,
      },
    ],
  )
})
