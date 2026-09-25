import assert from 'node:assert/strict'
import test from 'node:test'
import {
  actualPoolView,
  generatePoolAwareCard,
  poolExpectationView,
  poolProjectionCopy,
  poolProjectionsForWeek,
  projectPoolForGame,
} from '../src/cardPoolAware.ts'
import { PREDICTION_STRATEGY_ID } from '../src/playerPrediction.ts'
import type { PlayerHistory, RecommendationHistory } from '../src/types.ts'
import type { GameAnalysis, SlateGame, Team } from '../src/types.ts'

function team(abbrev: string): Team {
  return {
    id: `${abbrev}-id`,
    abbrev,
    name: abbrev,
    nickname: abbrev,
    location: abbrev,
    conference: 'AFC',
    record: '0-0',
    rank: null,
    pickemPctStraightUp: 50,
    pickemPctAgainstSpread: 50,
  }
}

function analysis(edge: number, category: GameAnalysis['category']): GameAnalysis {
  const game: SlateGame = {
    id: 'game-id',
    cbsEventId: 9,
    sport: 'NFL',
    week: 3,
    status: 'SCHEDULED',
    kickoff: '2026-09-21T13:00:00-04:00',
    kickoffLabel: 'Sun 1:00 PM ET',
    tv: null,
    away: team('DAL'),
    home: team('NYG'),
    homeSpread: -2.5,
    line: 'NYG -2.5',
  }
  return {
    game,
    odds: undefined,
    consensus: undefined,
    liveHomeSpread: -2.5,
    edge,
    category,
    recommendedSide: edge > 0 ? 'home' : null,
  }
}

test('poolProjectionCopy keeps unknowns visible', () => {
  const projection = projectPoolForGame([
    'home',
    'home',
    'away',
    null,
    null,
    undefined,
  ])
  assert.deepEqual(projection, {
    home: 2,
    away: 1,
    unknown: 3,
    called: 3,
  })
  assert.match(poolProjectionCopy(projection), /3 unknown/)
})

test('poolExpectationView names the expected side among calls', () => {
  const projection = projectPoolForGame([
    ...Array.from({ length: 20 }, () => 'home' as const),
    ...Array.from({ length: 2 }, () => 'away' as const),
    null,
    null,
    null,
    null,
  ])
  const view = poolExpectationView(projection, 'Indiana', 'Northwestern')
  assert.equal(view?.line, 'Indiana 91%')
  assert.equal(view?.detail, '20 of 22 calls · 4 unknown')
  assert.match(view?.title ?? '', /expect 91% of the pool to take Indiana/)
  assert.equal(view?.side, 'home')
  assert.equal(view?.pct, 91)
})

test('poolExpectationView calls a split instead of a 50% side', () => {
  const view = poolExpectationView(
    projectPoolForGame(['home', 'away', null]),
    'Indiana',
    'Northwestern',
  )
  assert.equal(view?.line, 'Pool looks split')
  assert.equal(view?.side, null)
  assert.match(view?.detail ?? '', /1 home \/ 1 away/)
})

test('poolExpectationView reports no calls without inventing a leader', () => {
  const view = poolExpectationView(
    projectPoolForGame([null, null, undefined]),
    'Indiana',
    'Northwestern',
  )
  assert.equal(view?.line, 'No calls yet')
  assert.equal(view?.none, true)
  assert.equal(view?.detail, '3 players unknown')
})

test('actualPoolView names submitted cards and keeps the ATS book', () => {
  const expected = poolExpectationView(
    projectPoolForGame([
      ...Array.from({ length: 20 }, () => 'home' as const),
      ...Array.from({ length: 2 }, () => 'away' as const),
    ]),
    'Green Bay',
    'Atlanta',
  )
  const view = actualPoolView(
    { home: 18, away: 7, unpicked: 1, picked: 25 },
    { correct: 8, wrong: 17, push: 0, unpicked: 1, pending: 0 },
    'Green Bay',
    'Atlanta',
    expected,
  )
  assert.equal(view?.line, 'Green Bay 72%')
  assert.equal(view?.detail, '18 of 25 picks · 1 unpicked · Pool 8–17–1')
  assert.match(view?.title ?? '', /72% of submitted picks took Green Bay/)
  assert.match(view?.title ?? '', /Forecast was Green Bay 91%/)
})

test('actualPoolView notes when the field flipped the forecast', () => {
  const expected = poolExpectationView(
    projectPoolForGame(['home', 'home', 'away']),
    'Green Bay',
    'Atlanta',
  )
  const view = actualPoolView(
    { home: 4, away: 12, unpicked: 0, picked: 16 },
    { correct: 12, wrong: 4, push: 0, unpicked: 0, pending: 0 },
    'Green Bay',
    'Atlanta',
    expected,
  )
  assert.equal(view?.line, 'Atlanta 75%')
  assert.match(view?.title ?? '', /Forecast leaned the other way/)
})

test('actualPoolView stays hidden until a side or a graded book exists', () => {
  assert.equal(
    actualPoolView(
      { home: 0, away: 0, unpicked: 4, picked: 0 },
      { correct: 0, wrong: 0, push: 0, unpicked: 4, pending: 0 },
      'Green Bay',
      'Atlanta',
    ),
    null,
  )
})

test('poolProjectionsForWeek counts frozen predicted sides once per player', () => {
  const history = {
    entries: [
      { entryId: 'a', name: 'A' },
      { entryId: 'b', name: 'B' },
      { entryId: 'c', name: 'C' },
    ],
    weeks: [],
    pool: { seasonYear: 2026 },
  } as unknown as PlayerHistory
  const recommendations = {
    weeks: [
      {
        week: 4,
        label: 'Week 4',
        games: [{ cbsEventId: 9, away: 'NWEST', home: 'IND' }],
      },
    ],
  } as unknown as RecommendationHistory
  const forecasts = {
    updatedAt: '',
    residuals: null,
    weeks: [
      {
        week: 4,
        label: 'Week 4',
        strategyId: PREDICTION_STRATEGY_ID,
        capturedAt: '',
        frozenAt: null,
        trainingThroughWeek: 3,
        players: [
          {
            entryId: 'a',
            name: 'A',
            games: [{ cbsEventId: 9, predictedSide: 'home' }],
          },
          {
            entryId: 'b',
            name: 'B',
            games: [{ cbsEventId: 9, predictedSide: 'home' }],
          },
          {
            entryId: 'c',
            name: 'C',
            games: [{ cbsEventId: 9, predictedSide: null }],
          },
        ],
      },
    ],
  }
  const projections = poolProjectionsForWeek(
    history,
    recommendations,
    forecasts as never,
    4,
  )
  assert.deepEqual(projections.get(9), {
    home: 2,
    away: 0,
    unknown: 1,
    called: 2,
  })
})

test('pool-aware card keeps favorable-hook value and a hammer ahead of leverage', () => {
  const sides = Array.from({ length: 20 }, (_, index) =>
    index < 16 ? ('home' as const) : ('away' as const),
  )
  const projection = projectPoolForGame(sides)
  const projections = new Map([[9, projection]])

  const leverage = generatePoolAwareCard(
    [analysis(0, 'neutral')],
    { order: 3, label: 'Week 3' },
    2026,
    null,
    projections,
  )
  assert.equal(leverage.strategyId, 'v1-pool-aware')
  assert.equal(leverage.picks[0]?.source, 'line-value')
  assert.equal(leverage.picks[0]?.pickedSide, 'home')
  assert.equal(leverage.picks[0]?.hook, 'fg')
  assert.match(String(leverage.picks[0]?.detail), /FG hook \+0.5/)

  const hammer = generatePoolAwareCard(
    [analysis(3.2, 'hammer')],
    { order: 3, label: 'Week 3' },
    2026,
    null,
    projections,
  )
  assert.equal(hammer.picks[0]?.source, 'line-value')
  assert.equal(hammer.picks[0]?.pickedSide, 'home')
  assert.match(String(hammer.picks[0]?.detail), /Projected pool/)
})
