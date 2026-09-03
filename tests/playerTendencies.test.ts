import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizePlayer } from '../src/playerTendencies.ts'
import type { AppearanceTravelRest } from '../src/travelRest.ts'
import type {
  FrozenRecommendation,
  PlayerPick,
  PlayerWeek,
  RecommendationWeek,
} from '../src/types.ts'

function pick(
  cbsEventId: number,
  pickedSide: PlayerPick['pickedSide'],
  extras: Partial<PlayerPick> = {},
): PlayerPick {
  return {
    gameId: String(cbsEventId),
    cbsEventId,
    sport: 'NCAAF',
    away: 'Away',
    home: 'Home',
    homeSpread: -3,
    pickedTeamId: pickedSide,
    pickedTeam: pickedSide === 'home' ? 'Home' : pickedSide === 'away' ? 'Away' : null,
    pickedSide,
    result: extras.result ?? 'win',
    points: null,
    pickStatus: null,
    matchStatus: 'matched',
    ...extras,
  }
}

function playerWeek(
  week: number,
  picks: PlayerPick[],
  tiebreakerAnswer: number | null = null,
): PlayerWeek {
  return {
    week,
    seasonYear: 2026,
    periodId: `2026-${week}`,
    label: `Week ${week}`,
    status: 'scored',
    scored: true,
    slateFile: `2026-${week}.json`,
    entries: [
      {
        entryId: 'dan',
        name: 'Dan',
        weekScore: null,
        weekRank: null,
        correctPicks: null,
        picksCount: picks.length,
        tiebreaker: { question: null, answer: tiebreakerAnswer },
        picks,
      },
    ],
  }
}

function rec(
  cbsEventId: number,
  extras: Partial<FrozenRecommendation>,
): FrozenRecommendation {
  return {
    cbsEventId,
    sport: 'NCAAF',
    kickoff: '2026-09-05T12:00:00-04:00',
    away: 'AWAY',
    home: 'HOME',
    homeSpread: -3,
    liveHomeSpread: -3,
    category: 'slight',
    recommendedSide: 'home',
    hook: null,
    cover: null,
    source: 'line-value',
    pickedSide: 'home',
    strength: 'mild',
    score: 3,
    ...extras,
  }
}

function recWeek(
  week: number,
  games: FrozenRecommendation[],
  draftKingsTotal: number | null = null,
): RecommendationWeek {
  return {
    week,
    seasonYear: 2026,
    label: `Week ${week}`,
    capturedAt: '2026-09-05T12:00:00.000Z',
    scored: true,
    tiebreaker:
      draftKingsTotal == null
        ? null
        : { cbsEventId: 1, draftKingsTotal, frozenAt: '2026-09-05T16:00:00.000Z' },
    games,
  }
}

test('summarizePlayer splits kickoff-frozen rec follow rates by tier', () => {
  const summary = summarizePlayer(
    'dan',
    [
      playerWeek(1, [
        pick(1, 'home'),
        pick(2, 'away'),
        pick(3, 'home'),
        pick(4, 'away'),
        pick(5, 'home'),
        pick(6, 'away'),
      ]),
    ],
    [
      recWeek(1, [
        rec(1, { category: 'lock', recommendedSide: 'home', source: 'line-value' }),
        rec(2, { category: 'hammer', recommendedSide: 'home', source: 'line-value' }),
        rec(3, { category: 'lean', recommendedSide: 'away', source: 'line-value' }),
        rec(4, { category: 'slight', recommendedSide: 'away', source: 'line-value' }),
        rec(5, {
          category: 'neutral',
          recommendedSide: null,
          source: 'public-consensus',
          pickedSide: 'home',
        }),
        rec(6, {
          category: 'neutral',
          recommendedSide: null,
          source: null,
          pickedSide: null,
        }),
      ]),
    ],
    2026,
  )

  assert.equal(summary.lineValueRate, '50%')
  assert.equal(summary.lineValueDetail, '2 of 4 line-value games')
  assert.equal(summary.tiers.lock.rate, '100%')
  assert.equal(summary.tiers.lock.detail, '1 of 1 locks')
  assert.equal(summary.tiers.hammer.rate, '0%')
  assert.equal(summary.tiers.hammer.detail, '0 of 1 hammers')
  assert.equal(summary.tiers.lean.rate, '0%')
  assert.equal(summary.tiers.slight.rate, '100%')
  assert.equal(summary.tiers.neutral.rate, '50%')
  assert.equal(summary.tiers.neutral.detail, '1 of 2 home picks · no line-value edge')
})

test('summarizePlayer ignores unpicked games and empty tiers stay blank', () => {
  const summary = summarizePlayer(
    'dan',
    [playerWeek(1, [pick(1, 'home'), pick(2, null, { result: null })])],
    [
      recWeek(1, [
        rec(1, { category: 'slight', recommendedSide: 'home' }),
        rec(2, { category: 'lock', recommendedSide: 'away' }),
        rec(3, { category: 'hammer', recommendedSide: 'home' }),
      ]),
    ],
    2026,
  )

  assert.equal(summary.tiers.slight.rate, '100%')
  assert.equal(summary.tiers.lock.rate, '—')
  assert.equal(summary.tiers.lock.detail, 'No overlapping locks yet')
  assert.equal(summary.tiers.hammer.rate, '—')
  assert.equal(summary.tiers.neutral.rate, '—')
})

test('summarizePlayer keeps the overall line-value tile on card source', () => {
  const summary = summarizePlayer(
    'dan',
    [playerWeek(1, [pick(1, 'home'), pick(2, 'home')])],
    [
      recWeek(1, [
        rec(1, {
          category: 'slight',
          recommendedSide: 'home',
          source: 'line-value',
        }),
        rec(2, {
          category: 'slight',
          recommendedSide: 'away',
          source: null,
        }),
      ]),
    ],
    2026,
  )

  assert.equal(summary.lineValueRate, '100%')
  assert.equal(summary.lineValueDetail, '1 of 1 line-value games')
  assert.equal(summary.tiers.slight.detail, '1 of 2 slights')
  assert.equal(summary.travel.threePlus.rate, '—')
  assert.equal(summary.rest.short.detail, 'No overlapping short-week teams yet')
})

test('summarizePlayer pick rates follow the traveling and rested sides', () => {
  const travelRest = new Map<string, AppearanceTravelRest>([
    [
      '1:away',
      {
        travel: { zones: 3, direction: 'east', label: '3 time zones east' },
        rest: { days: 4, kind: 'short', label: 'Short week · 4d' },
      },
    ],
    [
      '1:home',
      {
        travel: { zones: 0, direction: 'same', label: 'Same time zone' },
        rest: { days: 7, kind: 'normal', label: '7d rest' },
      },
    ],
    [
      '2:away',
      {
        travel: { zones: 1, direction: 'west', label: '1 time zone west' },
        rest: null,
      },
    ],
    [
      '2:home',
      {
        travel: null,
        rest: { days: 14, kind: 'bye', label: 'Off a bye · 14d' },
      },
    ],
  ])

  const summary = summarizePlayer(
    'dan',
    [playerWeek(1, [pick(1, 'home'), pick(2, 'away')])],
    [
      recWeek(1, [
        rec(1, { category: 'slight', recommendedSide: 'home' }),
        rec(2, { category: 'lean', recommendedSide: 'away' }),
      ]),
    ],
    2026,
    travelRest,
  )

  assert.equal(summary.travel.threePlus.rate, '0%')
  assert.equal(summary.travel.threePlus.detail, '0 of 1 3+ time-zone teams')
  assert.equal(summary.travel.oneZone.rate, '100%')
  assert.equal(summary.travel.oneZone.detail, '1 of 1 1-time-zone teams')
  assert.equal(summary.travel.twoZones.rate, '—')
  assert.equal(summary.rest.short.rate, '0%')
  assert.equal(summary.rest.short.detail, '0 of 1 short-week teams')
  assert.equal(summary.rest.normal.rate, '100%')
  assert.equal(summary.rest.bye.rate, '0%')
  assert.equal(summary.rest.bye.detail, '0 of 1 bye teams')
})
