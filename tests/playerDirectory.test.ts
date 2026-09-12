import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignPlayerSlugs,
  entryWinRate,
  entryWinRecord,
  playerRankingWeeks,
  playerSlug,
  rankPlayersByReadability,
  rankPlayersByWins,
  sortPlayersByWins,
} from '../src/playerDirectory.ts'
import type {
  PlayerPick,
  PlayerRosterEntry,
  PlayerWeek,
} from '../src/types.ts'

function entry(entryId: string, name: string): PlayerRosterEntry {
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

function pick(result: PlayerPick['result']): PlayerPick {
  return {
    gameId: 'g',
    cbsEventId: 1,
    sport: 'NFL',
    away: 'Away',
    home: 'Home',
    homeSpread: -3,
    pickedTeamId: 'home',
    pickedTeam: 'Home',
    pickedSide: 'home',
    result,
    points: null,
    pickStatus: null,
    matchStatus: 'matched',
  }
}

function week(
  rows: Array<{ entryId: string; results: Array<PlayerPick['result']> }>,
  weekNumber = 1,
  seasonYear = 2026,
): PlayerWeek {
  return {
    week: weekNumber,
    seasonYear,
    periodId: `${seasonYear}-${weekNumber}`,
    label: `Week ${weekNumber}`,
    status: 'scored',
    scored: true,
    slateFile: '2026-1.json',
    entries: rows.map((row) => ({
      entryId: row.entryId,
      name: row.entryId,
      weekScore: null,
      weekRank: null,
      correctPicks: null,
      picksCount: null,
      tiebreaker: { question: null, answer: null },
      picks: row.results.map(pick),
    })),
  }
}

test('entryWinRate is wins over scored picks and ignores ungraded rows', () => {
  const weeks = [
    week([
      { entryId: 'a', results: ['win', 'loss', 'push', null] },
    ]),
  ]
  assert.deepEqual(entryWinRecord('a', weeks), { wins: 1, scored: 3 })
  assert.equal(entryWinRate('a', weeks), 1 / 3)
  assert.deepEqual(entryWinRecord('missing', weeks), { wins: 0, scored: 0 })
  assert.equal(entryWinRate('missing', weeks), null)
})

test('sortPlayersByWins ranks more wins first, then rate, then name', () => {
  const entries = [
    entry('c', 'Casey'),
    entry('a', 'Avery'),
    entry('b', 'Blair'),
    entry('d', 'Drew'),
    entry('e', 'Eden'),
  ]
  const weeks = [
    week([
      { entryId: 'c', results: ['win', 'win', 'loss'] },
      { entryId: 'a', results: ['win', 'loss'] },
      { entryId: 'b', results: ['win'] },
      { entryId: 'd', results: ['loss', 'loss'] },
    ]),
  ]

  assert.deepEqual(
    sortPlayersByWins(entries, weeks).map((row) => row.name),
    ['Casey', 'Blair', 'Avery', 'Drew', 'Eden'],
  )
})

test('a perfect short card does not outrank a bigger win count', () => {
  const entries = [entry('trevor', 'Trevor Miller'), entry('tyler', 'Tyler Kopas')]
  const weeks = [
    week([
      { entryId: 'trevor', results: ['win', 'win', 'win'] },
      { entryId: 'tyler', results: ['win', 'win', 'win', 'win', 'win', 'loss', 'loss'] },
    ]),
  ]

  assert.deepEqual(entryWinRecord('trevor', weeks), { wins: 3, scored: 3 })
  assert.equal(entryWinRate('trevor', weeks), 1)
  assert.deepEqual(
    sortPlayersByWins(entries, weeks).map((row) => row.name),
    ['Tyler Kopas', 'Trevor Miller'],
  )
})

test('players without a graded pick stay under an 0-for-2 card', () => {
  const entries = [entry('quiet', 'Quiet Quinn'), entry('cold', 'Cold Casey')]
  const weeks = [week([{ entryId: 'cold', results: ['loss', 'loss'] }])]

  assert.deepEqual(
    sortPlayersByWins(entries, weeks).map((row) => row.name),
    ['Cold Casey', 'Quiet Quinn'],
  )
})

test('sortPlayersByWins uses alphabetical order when records match', () => {
  const entries = [entry('z', 'zoe'), entry('a', 'Ada'), entry('m', 'Mia')]
  const weeks = [
    week([
      { entryId: 'z', results: ['win'] },
      { entryId: 'a', results: ['win'] },
      { entryId: 'm', results: ['win'] },
    ]),
  ]

  assert.deepEqual(
    sortPlayersByWins(entries, weeks).map((row) => row.name),
    ['Ada', 'Mia', 'zoe'],
  )
})

test('rankPlayersByWins gives matching records the same displayed rank', () => {
  const entries = [
    entry('leader', 'Leader'),
    entry('beta', 'Beta'),
    entry('alpha', 'Alpha'),
    entry('last', 'Last'),
  ]
  const weeks = [
    week([
      { entryId: 'leader', results: ['win', 'win'] },
      { entryId: 'alpha', results: ['win', 'loss'] },
      { entryId: 'beta', results: ['win', 'loss'] },
      { entryId: 'last', results: ['loss'] },
    ]),
  ]

  assert.deepEqual(
    rankPlayersByWins(entries, weeks).map(({ entry: row, rank, record }) => [
      row.name,
      rank,
      record.wins,
      record.scored,
    ]),
    [
      ['Leader', 1, 2, 2],
      ['Alpha', 2, 1, 2],
      ['Beta', 2, 1, 2],
      ['Last', 4, 0, 1],
    ],
  )
})

test('playerRankingWeeks supports one week or the current season rollup', () => {
  const weeks = [
    week([{ entryId: 'a', results: ['win'] }], 1, 2025),
    week([{ entryId: 'a', results: ['loss'] }], 1, 2026),
    week([{ entryId: 'a', results: ['win'] }], 2, 2026),
  ]

  assert.deepEqual(
    playerRankingWeeks(weeks, 2, 2026).map(
      (row) => `${row.seasonYear}:${row.week}`,
    ),
    ['2026:2'],
  )
  assert.deepEqual(
    playerRankingWeeks(weeks, 'season', 2026).map(
      (row) => `${row.seasonYear}:${row.week}`,
    ),
    ['2026:1', '2026:2'],
  )
})

test('playerRankingWeeks treats readability as the current-season rollup', () => {
  const weeks = [
    week([{ entryId: 'a', results: ['win'] }], 1, 2025),
    week([{ entryId: 'a', results: ['loss'] }], 1, 2026),
    week([{ entryId: 'a', results: ['win'] }], 2, 2026),
  ]

  assert.deepEqual(
    playerRankingWeeks(weeks, 'readability', 2026).map(
      (row) => `${row.seasonYear}:${row.week}`,
    ),
    ['2026:1', '2026:2'],
  )
})

test('rankPlayersByReadability puts the most described player first', () => {
  const entries = [
    entry('quiet', 'Quiet Quinn'),
    entry('loud', 'Loud Lou'),
    entry('new', 'New Ned'),
  ]
  const ranked = rankPlayersByReadability(
    entries,
    [week([{ entryId: 'quiet', results: ['win'] }])],
    new Map([
      [
        'quiet',
        {
          score: 0.4,
          solidSignals: 0,
          thinSignals: 0,
          picks: 40,
          label: 'No pattern yet',
          detail: '40 graded picks, none loud enough',
        },
      ],
      [
        'loud',
        {
          score: 80,
          solidSignals: 1,
          thinSignals: 0,
          picks: 20,
          label: 'One clear tendency',
          detail: 'Home-team lean · 20 picks',
        },
      ],
      [
        'new',
        {
          score: 0.05,
          solidSignals: 0,
          thinSignals: 0,
          picks: 5,
          label: 'Still building',
          detail: '5 graded picks',
        },
      ],
    ]),
  )

  assert.deepEqual(
    ranked.map(({ entry: row, rank, readability }) => [
      row.name,
      rank,
      readability?.label,
    ]),
    [
      ['Loud Lou', 1, 'One clear tendency'],
      ['Quiet Quinn', 2, 'No pattern yet'],
      ['New Ned', 3, 'Still building'],
    ],
  )
})

test('playerSlug turns roster names into URL paths', () => {
  assert.equal(playerSlug('Dan Sullivan'), 'dan-sullivan')
  assert.equal(playerSlug('DAVID KOLICH'), 'david-kolich')
  assert.equal(playerSlug('jeff miller'), 'jeff-miller')
  assert.equal(playerSlug('Shawn  Sedate'), 'shawn-sedate')
  assert.equal(playerSlug('Phil SQ'), 'phil-sq')
})

test('assignPlayerSlugs disambiguates the same name twice', () => {
  assert.deepEqual(
    assignPlayerSlugs([
      { entryId: 'a', name: 'Dan Sullivan' },
      { entryId: 'b', name: 'Dan  Sullivan' },
    ]),
    ['dan-sullivan', 'dan-sullivan-2'],
  )
})
