import assert from 'node:assert/strict'
import test from 'node:test'
import {
  entryWinRate,
  sortPlayersByWinRate,
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
  assert.equal(entryWinRate('a', weeks), 1 / 3)
  assert.equal(entryWinRate('missing', weeks), null)
})

test('sortPlayersByWinRate ranks higher percentages first, then name', () => {
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
      { entryId: 'b', results: ['win', 'loss'] },
      { entryId: 'd', results: ['loss', 'loss'] },
    ]),
  ]

  assert.deepEqual(
    sortPlayersByWinRate(entries, weeks).map((row) => row.name),
    ['Casey', 'Avery', 'Blair', 'Drew', 'Eden'],
  )
})

test('sortPlayersByWinRate uses alphabetical order when rates match', () => {
  const entries = [entry('z', 'zoe'), entry('a', 'Ada'), entry('m', 'Mia')]
  const weeks = [
    week([
      { entryId: 'z', results: ['win'] },
      { entryId: 'a', results: ['win'] },
      { entryId: 'm', results: ['win'] },
    ]),
  ]

  assert.deepEqual(
    sortPlayersByWinRate(entries, weeks).map((row) => row.name),
    ['Ada', 'Mia', 'zoe'],
  )
})
