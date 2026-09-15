import assert from 'node:assert/strict'
import test from 'node:test'
import type { PredictionForecastWeek } from '../src/playerPrediction.ts'
import type {
  FrozenRecommendation,
  PlayerWeek,
  RecommendationWeek,
} from '../src/types.ts'
import {
  buildSeasonRecap,
  buildWeeklyRecap,
} from '../src/weeklyRecap.ts'

function game(
  cbsEventId: number,
  sport: 'NFL' | 'NCAAF',
  away: string,
  home: string,
  homeSpread: number,
  cover: 'home' | 'away',
  recommendedSide: 'home' | 'away',
  category: 'hammer' | 'slight',
): FrozenRecommendation {
  return {
    cbsEventId,
    sport,
    kickoff: '2026-09-12T13:00:00-04:00',
    away,
    home,
    homeSpread,
    liveHomeSpread: homeSpread,
    category,
    recommendedSide,
    hook: null,
    cover,
    source: 'line-value',
    pickedSide: recommendedSide,
    strength: category === 'hammer' ? 'strong' : 'mild',
    score: 3,
  }
}

const recWeek: RecommendationWeek = {
  week: 2,
  seasonYear: 2026,
  label: 'Week 2',
  capturedAt: '2026-09-15T00:00:00Z',
  scored: true,
  games: [
    game(1, 'NFL', 'A', 'B', -7.5, 'away', 'away', 'hammer'),
    game(2, 'NFL', 'C', 'D', -3, 'home', 'home', 'slight'),
    game(3, 'NCAAF', 'E', 'F', 10.5, 'away', 'away', 'hammer'),
    game(4, 'NCAAF', 'G', 'H', -14, 'away', 'home', 'slight'),
  ],
}

const picks = [
  ['away', 'home', 'away', 'home'],
  ['home', 'home', 'away', 'away'],
  ['home', 'home', 'home', 'away'],
] as const

const playerWeek = {
  week: 2,
  seasonYear: 2026,
  periodId: '2026-2',
  label: 'Week 2',
  status: 'scored',
  scored: true,
  slateFile: 'week-2.json',
  entries: ['Alice', 'Bob', 'Carol'].map((name, playerIndex) => ({
    entryId: name.toLowerCase(),
    name,
    weekScore: playerIndex === 1 ? 2 : 3,
    weekRank: playerIndex === 1 ? 3 : 1,
    correctPicks: null,
    picksCount: 4,
    tiebreaker: { question: null, answer: null },
    picks: recWeek.games.map((row, gameIndex) => {
      const pickedSide = picks[playerIndex]?.[gameIndex] ?? null
      return {
        gameId: String(row.cbsEventId),
        cbsEventId: row.cbsEventId,
        sport: row.sport,
        away: row.away,
        home: row.home,
        homeSpread: row.homeSpread,
        pickedTeamId: pickedSide,
        pickedTeam: pickedSide ? row[pickedSide] : null,
        pickedSide,
        result: null,
        points: null,
        pickStatus: null,
        matchStatus: 'matched',
      }
    }),
  })),
} as PlayerWeek

function forecastGames(correct: number) {
  return Array.from({ length: 8 }, (_, index) => ({
    cbsEventId: index + 1,
    sport: 'NFL' as const,
    away: 'A',
    home: 'B',
    homeSpread: -3,
    predictedSide: 'home' as const,
    predictedTeam: 'B',
    confidence: 'high' as const,
    habitKey: 'favorite' as const,
    reason: 'Favorite/dog habit · 25 prior chances',
    sampleSize: 25,
    actualSide: index < correct ? ('home' as const) : ('away' as const),
    correct: index < correct,
  }))
}

const forecastWeek = {
  week: 2,
  seasonYear: 2026,
  label: 'Week 2',
  strategyId: 'v1-habits',
  capturedAt: '2026-09-10T00:00:00Z',
  frozenAt: '2026-09-10T00:00:00Z',
  trainingThroughWeek: 1,
  players: [
    {
      entryId: 'alice',
      name: 'Alice',
      archetype: 'Favorite backer',
      archetypeDetail: 'test',
      priorPicks: 25,
      calls: 8,
      games: forecastGames(8),
    },
    {
      entryId: 'bob',
      name: 'Bob',
      archetype: 'Underdog hunter',
      archetypeDetail: 'test',
      priorPicks: 25,
      calls: 8,
      games: forecastGames(2),
    },
  ],
} as PredictionForecastWeek

test('weekly recap stays pending until CBS marks the player week scored', () => {
  assert.equal(
    buildWeeklyRecap({ ...playerWeek, scored: false }, recWeek, forecastWeek),
    null,
  )
})

test('weekly recap captions pool, players, leagues, teams, and card', () => {
  const recap = buildWeeklyRecap(playerWeek, recWeek, forecastWeek)
  assert.ok(recap)
  assert.deepEqual(recap.pool, [
    'Alice and Carol shared the lead at 3 wins.',
    'The pool majority went 3-1 ATS.',
    'A +7.5 was the sharpest pool fade to cash: 1 of 3 picks (33%).',
    'D -3 was the strongest winning chalk: 3 of 3 picks (100%).',
  ])
  assert.deepEqual(recap.players, [
    'Favorite/dog calls were the clearest pool-wide read, naming 10 of 16 submitted sides (63%).',
    'Profile strengthened: Alice played to the frozen favorite backer read on 8 of 8 called picks (100%).',
    'Profile weakened: Bob broke from the frozen underdog hunter read; it named only 2 of 8 picks (25%).',
  ])
  assert.deepEqual(recap.teamsAndLeagues, [
    'NFL favorites and underdogs split 1-1 ATS.',
    'College favorites and underdogs split 1-1 ATS.',
    'G +14 delivered the largest favorite fade, covering against H.',
  ])
  assert.deepEqual(recap.card, [
    'The frozen recommendation card finished 3-1 ATS on 4 calls.',
    'Hammer calls led the tiers at 2-0 ATS.',
  ])
})

test('season recap combines officially scored weeks', () => {
  const recap = buildSeasonRecap([playerWeek], [recWeek], [forecastWeek])
  assert.ok(recap)
  assert.equal(recap.label, 'Season to date')
  assert.equal(
    recap.pool[0],
    'Alice and Carol share the lead through 1 scored week with 3 wins.',
  )
  assert.deepEqual(recap.players, [
    'Favorite/dog calls were the clearest pool-wide read, naming 10 of 16 submitted sides (63%).',
    "Strongest season read: Alice's frozen calls have named 8 of 8 picks (100%) across 1 forecast week.",
    "Least settled season read: Bob's frozen calls have named 2 of 8 picks (25%) across 1 forecast week.",
  ])
  assert.deepEqual(recap.card, [
    'The frozen recommendation card finished 3-1 ATS on 4 calls.',
    'Hammer calls led the tiers at 2-0 ATS.',
  ])
})
