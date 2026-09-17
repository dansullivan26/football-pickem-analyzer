import assert from 'node:assert/strict'
import test from 'node:test'
import {
  orderCardRows,
  type SuggestedPick,
  type UnpickedGame,
} from '../src/cardStrategy.ts'

function pick(
  overrides: Partial<SuggestedPick> & Pick<SuggestedPick, 'gameId' | 'kickoff'>,
): SuggestedPick {
  return {
    cbsEventId: Number(overrides.gameId.replace(/\D/g, '') || 1),
    away: 'Away',
    awayId: 'away',
    home: 'Home',
    homeId: 'home',
    kickoffLabel: 'Sun 1:00 PM',
    pickedSide: 'home',
    pickedTeamId: 'home',
    pickedTeam: 'Home',
    poolSpread: -3,
    source: 'line-value',
    category: 'slight',
    edge: 1,
    strength: 'mild',
    hook: null,
    publicSupport: 'none',
    publicPct: null,
    score: 3,
    compositeEdge: 1,
    detail: '1-point line value',
    ...overrides,
  }
}

function unpicked(
  overrides: Partial<UnpickedGame> & Pick<UnpickedGame, 'gameId' | 'kickoff'>,
): UnpickedGame {
  return {
    cbsEventId: Number(overrides.gameId.replace(/\D/g, '') || 9),
    away: 'Review Away',
    awayId: 'review-away',
    home: 'Review Home',
    homeId: 'review-home',
    homeSpread: -3,
    kickoffLabel: 'Sun 1:00 PM',
    reason: 'No line-value, hook, rest, or travel advantage',
    ...overrides,
  }
}

test('kickoff sort feathers manual-review games into the slate', () => {
  const rows = orderCardRows(
    [
      pick({ gameId: 'late', kickoff: '2026-09-20T16:25:00-04:00', cbsEventId: 3 }),
      pick({ gameId: 'early', kickoff: '2026-09-20T13:00:00-04:00', cbsEventId: 1 }),
    ],
    [
      unpicked({
        gameId: 'noon',
        kickoff: '2026-09-20T13:00:00-04:00',
        cbsEventId: 2,
      }),
    ],
    'slate',
  )

  assert.deepEqual(
    rows.map((row) => (row.kind === 'pick' ? row.pick.gameId : row.game.gameId)),
    ['early', 'noon', 'late'],
  )
})

test('recommendation sort keeps manual-review games after ranked picks', () => {
  const rows = orderCardRows(
    [
      pick({
        gameId: 'slight',
        kickoff: '2026-09-20T16:25:00-04:00',
        cbsEventId: 3,
        category: 'slight',
        edge: 1,
        compositeEdge: 1,
      }),
      pick({
        gameId: 'lean',
        kickoff: '2026-09-20T13:00:00-04:00',
        cbsEventId: 1,
        category: 'lean',
        edge: 2,
        compositeEdge: 2,
      }),
    ],
    [
      unpicked({
        gameId: 'noon',
        kickoff: '2026-09-20T13:00:00-04:00',
        cbsEventId: 2,
      }),
    ],
    'recommendation',
  )

  assert.deepEqual(
    rows.map((row) => (row.kind === 'pick' ? row.pick.gameId : row.game.gameId)),
    ['lean', 'slight', 'noon'],
  )
})
