import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatCardKickoff,
  formatSuggestedCardText,
  groupCardRowsByDay,
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
    awayAbbrev: 'AWAY',
    awayId: 'away',
    home: 'Home',
    homeAbbrev: 'HOME',
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
    awayAbbrev: 'RA',
    awayId: 'review-away',
    home: 'Review Home',
    homeAbbrev: 'RH',
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

test('groupCardRowsByDay keeps days in kickoff order with a today label', () => {
  const rows = orderCardRows(
    [
      pick({
        gameId: 'sun',
        kickoff: '2026-09-20T13:00:00-04:00',
        cbsEventId: 2,
        category: 'slight',
        compositeEdge: 1,
      }),
      pick({
        gameId: 'sat',
        kickoff: '2026-09-19T12:00:00-04:00',
        cbsEventId: 1,
        category: 'lean',
        compositeEdge: 2,
      }),
    ],
    [
      unpicked({
        gameId: 'sat-review',
        kickoff: '2026-09-19T15:30:00-04:00',
        cbsEventId: 3,
      }),
    ],
    'recommendation',
  )
  const groups = groupCardRowsByDay(
    rows,
    Date.parse('2026-09-19T18:00:00-04:00'),
  )

  assert.deepEqual(
    groups.map((group) => group.label),
    ['Today · Saturday · Sep 19', 'Sunday · Sep 20'],
  )
  assert.deepEqual(
    groups.map((group) =>
      group.rows.map((row) =>
        row.kind === 'pick' ? row.pick.gameId : row.game.gameId,
      ),
    ),
    [
      ['sat', 'sat-review'],
      ['sun'],
    ],
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
        away: 'Kansas City',
        awayAbbrev: 'KC',
        awayId: 'kan',
        home: 'New York Giants',
        homeAbbrev: 'NYG',
        pickedSide: 'away',
        pickedTeamId: 'kan',
        pickedTeam: 'Kansas City',
        poolSpread: 5.5,
      }),
      pick({
        gameId: 'unc',
        kickoff: '2026-09-19T12:00:00-04:00',
        away: 'North Carolina',
        awayAbbrev: 'UNC',
        awayId: 'unc',
        home: 'Clemson',
        homeAbbrev: 'CLEM',
        pickedSide: 'away',
        pickedTeamId: 'unc',
        pickedTeam: 'North Carolina',
        poolSpread: 3.5,
      }),
    ],
    unpicked: [
      unpicked({
        gameId: 'manual',
        kickoff: '2026-09-21T20:15:00-04:00',
        away: 'Detroit',
        awayAbbrev: 'DET',
        home: 'Buffalo',
        homeAbbrev: 'BUF',
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
    'Saturday:\n\nUNC +3.5\n\nSunday:\n\nKC +5.5\n\nMonday:\n\nDET @ BUF (manual review, no lean)',
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
    'Saturday:\n\nUNC +3.5\n\nSunday:\n\nNYG -5.5\n\nMonday:\n\nDET +4.5 (manual pick)',
  )
})

test('formatSuggestedCardText tags an unpicked manual-review lean', () => {
  const card: SuggestedCard = {
    strategyId: 'test',
    title: 'ATS Card',
    strategyNote: 'noisy note',
    generatedAt: '2026-09-19T12:00:00.000Z',
    seasonYear: 2026,
    week: 3,
    weekLabel: 'Week 3',
    picks: [],
    unpicked: [
      unpicked({
        gameId: 'lean',
        kickoff: '2026-09-19T12:00:00-04:00',
        away: 'NC State',
        awayAbbrev: 'NCST',
        home: 'Vanderbilt',
        homeAbbrev: 'VANDY',
        homeSpread: -3.5,
        leanSide: 'away',
        leanTeam: 'NCST',
        leanSpread: 3.5,
      }),
      unpicked({
        gameId: 'flat',
        kickoff: '2026-09-19T15:30:00-04:00',
        away: 'Arizona State',
        awayAbbrev: 'ARIZST',
        home: 'Kansas',
        homeAbbrev: 'KANSAS',
        homeSpread: -2.5,
      }),
    ],
    tiebreaker: null,
  }

  assert.equal(
    formatSuggestedCardText(card),
    'Saturday:\n\nNCST +3.5 (lean only, no pick)\nARIZST @ KANSAS (manual review, no lean)',
  )
})
