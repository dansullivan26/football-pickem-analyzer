import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignPlayerSlugs,
  entryWinRate,
  entryWinRecord,
  playerSlug,
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
): PlayerWeek {
  return {
    week: 1,
    seasonYear: 2026,
    periodId: '2026-1',
    label: 'Week 1',
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
