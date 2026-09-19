import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatCardKickoff,
  formatSuggestedCardText,
  orderCardRows,
  type SuggestedCard,
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

test('formatCardKickoff writes a compact Eastern kickoff', () => {
  assert.equal(formatCardKickoff('2026-09-17T20:15:00-04:00'), 'Thu 8:15pm')
  assert.equal(formatCardKickoff('2026-09-20T13:00:00-04:00'), 'Sun 1:00pm')
  assert.equal(formatCardKickoff('not a date'), null)
})

test('formatSuggestedCardText copies only team and spread', () => {
  const card: SuggestedCard = {
    strategyId: 'test',
    title: 'ATS Card',
    strategyNote: 'noisy note',
    generatedAt: '2026-09-19T12:00:00.000Z',
    seasonYear: 2026,
    week: 3,
    weekLabel: 'Week 3',
    picks: [
      pick({
        gameId: 'kan',
        kickoff: '2026-09-20T13:00:00-04:00',
        away: 'KAN',
        awayId: 'kan',
        home: 'NYG',
        pickedSide: 'away',
        pickedTeamId: 'kan',
        pickedTeam: 'KAN',
        poolSpread: 5.5,
      }),
      pick({
        gameId: 'unc',
        kickoff: '2026-09-19T12:00:00-04:00',
        away: 'UNC',
        awayId: 'unc',
        home: 'CLEM',
        pickedSide: 'away',
        pickedTeamId: 'unc',
        pickedTeam: 'UNC',
        poolSpread: 3.5,
      }),
    ],
    unpicked: [
      unpicked({
        gameId: 'manual',
        kickoff: '2026-09-21T20:15:00-04:00',
        away: 'DET',
        home: 'BUF',
        homeSpread: -4.5,
      }),
    ],
    tiebreaker: {
      questionId: 'tb',
      gameId: 'tb',
      question: 'How many total points will be scored?',
      away: 'DET',
      home: 'BUF',
      draftKingsTotal: 48.5,
      totalRetrievedAt: null,
    },
  }

  assert.equal(
    formatSuggestedCardText(card),
    'Saturday:\n\nUNC +3.5\n\nSunday:\n\nKAN +5.5',
  )
  assert.equal(
    formatSuggestedCardText(
      card,
      card.picks,
      new Set(['kan']),
      51,
      new Map([['manual', 'away']]),
      'slate',
    ),
    'Saturday:\n\nUNC +3.5\n\nSunday:\n\nNYG -5.5\n\nMonday:\n\nDET +4.5',
  )
})
