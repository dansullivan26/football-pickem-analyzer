import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generatePoolAwareCard,
  poolProjectionCopy,
  projectPoolForGame,
} from '../src/cardPoolAware.ts'
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
