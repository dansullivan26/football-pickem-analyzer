import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyWinRecord,
  type PlayerWinRecord,
} from '../src/playerDirectory.ts'
import {
  kickoffByEventId,
  nflKickoffWindow,
  summarizeCardNflWindows,
  summarizeEntryNflWindows,
  summarizePoolNflWindows,
} from '../src/nflWindows.ts'
import type { FrozenRecommendation, PlayerPick, PlayerWeek } from '../src/types.ts'

test('nflKickoffWindow buckets the usual NFL TV windows', () => {
  assert.equal(nflKickoffWindow('2026-10-01T20:15:00-04:00'), 'tnf')
  assert.equal(nflKickoffWindow('2026-10-01T20:35:00-04:00'), 'tnf')
  assert.equal(nflKickoffWindow('2026-10-04T13:00:00-04:00'), 'sun1')
  assert.equal(nflKickoffWindow('2026-10-04T16:05:00-04:00'), 'sun4')
  assert.equal(nflKickoffWindow('2026-10-04T16:25:00-04:00'), 'sun4')
  assert.equal(nflKickoffWindow('2026-10-04T20:20:00-04:00'), 'snf')
  assert.equal(nflKickoffWindow('2026-10-05T20:15:00-04:00'), 'mnf')
  assert.equal(nflKickoffWindow('2026-10-04T09:30:00-04:00'), null)
  assert.equal(nflKickoffWindow('2026-09-23T20:20:00-04:00'), null)
})

function pick(
  cbsEventId: number,
  result: PlayerPick['result'],
  sport: 'NFL' | 'NCAAF' = 'NFL',
): PlayerPick {
  return {
    gameId: `g-${cbsEventId}`,
    cbsEventId,
    sport,
    away: 'AWAY',
    home: 'HOME',
    homeSpread: -3,
    pickedTeamId: 'away',
    pickedTeam: 'AWAY',
    pickedSide: 'away',
    result,
    points: result === 'win' ? 1 : 0,
    pickStatus: result === 'win' ? 'CORRECT' : 'INCORRECT',
    matchStatus: 'matched',
  }
}

function week(picks: PlayerPick[], entryId = 'dan'): PlayerWeek {
  return {
    week: 5,
    seasonYear: 2026,
    periodId: '2026-5',
    label: 'Week 5',
    status: 'scored',
    scored: true,
    slateFile: 'week-5.json',
    entries: [
      {
        entryId,
        name: entryId,
        weekScore: null,
        weekRank: null,
        correctPicks: null,
        picksCount: picks.length,
        tiebreaker: { question: null, answer: null },
        picks,
      },
    ],
  }
}

test('player NFL windows join kickoff and ignore college and London', () => {
  const kickoffs = kickoffByEventId([
    [
      { cbsEventId: 1, kickoff: '2026-10-01T20:15:00-04:00' },
      { cbsEventId: 2, kickoff: '2026-10-04T13:00:00-04:00' },
      { cbsEventId: 3, kickoff: '2026-10-04T16:25:00-04:00' },
      { cbsEventId: 4, kickoff: '2026-10-04T20:20:00-04:00' },
      { cbsEventId: 5, kickoff: '2026-10-05T20:15:00-04:00' },
      { cbsEventId: 6, kickoff: '2026-10-04T09:30:00-04:00' },
      { cbsEventId: 7, kickoff: '2026-10-03T12:00:00-04:00' },
    ],
  ])
  const records = summarizeEntryNflWindows(
    'dan',
    [
      week([
        pick(1, 'win'),
        pick(2, 'loss'),
        pick(2, 'win'),
        pick(3, 'push'),
        pick(4, 'win'),
        pick(5, 'loss'),
        pick(6, 'win'),
        pick(7, 'win', 'NCAAF'),
      ]),
    ],
    kickoffs,
  )

  assert.deepEqual(records.tnf, { wins: 1, losses: 0, pushes: 0, scored: 1 })
  assert.deepEqual(records.sun1, { wins: 1, losses: 1, pushes: 0, scored: 2 })
  assert.deepEqual(records.sun4, { wins: 0, losses: 0, pushes: 1, scored: 1 })
  assert.deepEqual(records.snf, { wins: 1, losses: 0, pushes: 0, scored: 1 })
  assert.deepEqual(records.mnf, { wins: 0, losses: 1, pushes: 0, scored: 1 })
})

test('pool NFL windows add every submitted card', () => {
  const kickoffs = new Map([[1, '2026-10-04T13:00:00-04:00']])
  const first = week([pick(1, 'win')], 'a')
  const second: PlayerWeek = {
    ...first,
    entries: [
      ...week([pick(1, 'loss')], 'b').entries,
      ...week([pick(1, 'win')], 'c').entries,
    ],
  }
  const records = summarizePoolNflWindows([first, second], kickoffs)
  assert.deepEqual(records.sun1, { wins: 2, losses: 1, pushes: 0, scored: 3 })
})

test('card NFL windows use the frozen picked side', () => {
  const game = (
    overrides: Partial<FrozenRecommendation>,
  ): FrozenRecommendation => ({
    cbsEventId: 1,
    sport: 'NFL',
    kickoff: '2026-10-04T16:25:00-04:00',
    away: 'SF',
    home: 'LAR',
    homeSpread: 3.5,
    liveHomeSpread: 3.5,
    category: 'lean',
    recommendedSide: 'away',
    hook: null,
    cover: 'away',
    source: 'line-value',
    pickedSide: 'away',
    strength: 'solid',
    score: 4,
    compositeEdge: 2,
    ...overrides,
  })
  const records = summarizeCardNflWindows([
    game({ cbsEventId: 1, cover: 'away' }),
    game({
      cbsEventId: 2,
      kickoff: '2026-10-04T13:00:00-04:00',
      cover: 'home',
    }),
    game({
      cbsEventId: 3,
      sport: 'NCAAF',
      kickoff: '2026-10-03T12:00:00-04:00',
    }),
  ])
  assert.deepEqual(records.sun4, { wins: 1, losses: 0, pushes: 0, scored: 1 })
  assert.deepEqual(records.sun1, { wins: 0, losses: 1, pushes: 0, scored: 1 })
  assert.deepEqual(records.tnf, emptyWinRecord() as PlayerWinRecord)
})
