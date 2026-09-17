import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyEdge,
  compareCardPicks,
  compareRecommendationOrder,
  COMPOSITE_EDGE_SCALE,
  FG_HOOK_POINTS,
  favorableHook,
  hookAdjustment,
  INJURY_TIER_POINTS,
  MAX_TEAM_INJURY_ADJUSTMENT,
  injuryAdjustment,
  teamInjuryLoad,
  keyNumberHook,
  recommendationAdjustment,
  resolveCardPick,
  TD_HOOK_POINTS,
  unfavorableHook,
  publicSupportForSide,
} from '../src/cardScoring.ts'
import type { NflStarterInjuryTeam } from '../src/nflStarterInjuries.ts'
import type { ConsensusGame } from '../src/types.ts'

function pick(
  overrides: Partial<{
    gameId: string
    source: 'line-value' | 'rest-travel' | 'public-consensus'
    strength: 'mild' | 'solid' | 'strong'
    publicSupport: 'agree' | 'none' | 'fade'
    publicPct: number | null
    score: number
    kickoff: string
  }> & { gameId: string },
) {
  return {
    source: 'line-value' as const,
    strength: 'mild' as const,
    publicSupport: 'none' as const,
    publicPct: null as number | null,
    score: 1.5,
    kickoff: '2026-09-05T12:00:00-04:00',
    ...overrides,
  }
}

function orderedIds(
  rows: ReturnType<typeof pick>[],
) {
  return [...rows]
    .sort(compareCardPicks)
    .map((row) => row.gameId)
}

function consensus(awayPicks: number, homePicks: number): ConsensusGame {
  return {
    gameId: 'game',
    cbsEventId: 1,
    sport: 'NCAAF',
    kickoff: '2026-09-05T12:00:00-04:00',
    matchStatus: 'matched',
    coversDetailsUrl: 'https://contests.covers.com/x',
    cbsHomeSpread: -3,
    away: {
      name: 'Away',
      abbrev: 'AWY',
      coversName: 'Away',
      spread: 3,
      pct: 40,
      picks: awayPicks,
    },
    home: {
      name: 'Home',
      abbrev: 'HME',
      coversName: 'Home',
      spread: -3,
      pct: 60,
      picks: homePicks,
    },
    atsByLine: [{ awaySpread: 3, awayPicks, homePicks }],
  }
}

test('a mild line-value slight outranks a strong public-only pick', () => {
  assert.deepEqual(
    orderedIds([
      pick({
        gameId: 'public',
        source: 'public-consensus',
        strength: 'strong',
        publicSupport: 'agree',
        score: 18,
      }),
      pick({
        gameId: 'slight',
        source: 'line-value',
        strength: 'mild',
        publicSupport: 'none',
        score: 1.5,
        kickoff: '2026-09-05T19:00:00-04:00',
      }),
    ]),
    ['slight', 'public'],
  )
})

test('public agreement does not reorder line-value plays', () => {
  assert.deepEqual(
    orderedIds([
      pick({
        gameId: 'fade-slight',
        strength: 'mild',
        publicSupport: 'fade',
        score: 3,
      }),
      pick({
        gameId: 'agree-slight',
        strength: 'mild',
        publicSupport: 'agree',
        score: 1.5,
        kickoff: '2026-09-05T19:00:00-04:00',
      }),
      pick({
        gameId: 'fade-lean',
        strength: 'solid',
        publicSupport: 'fade',
        score: 6,
        kickoff: '2026-09-05T15:00:00-04:00',
      }),
    ]),
    ['fade-lean', 'fade-slight', 'agree-slight'],
  )
})

test('publicSupportForSide agrees when the Covers bucket matches the pick', () => {
  const matched = consensus(20, 80)
  assert.equal(publicSupportForSide(matched, -3, 'home'), 'agree')
  assert.equal(publicSupportForSide(matched, -3, 'away'), 'fade')
  assert.equal(publicSupportForSide(undefined, -3, 'home'), 'none')
})

test('within a 1-point slight band, public percentage does not rank picks', () => {
  const ids = [
    {
      category: 'slight' as const,
      edge: 1,
      hook: null,
      publicSupport: 'agree' as const,
      publicPct: 60,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'quiet',
    },
    {
      category: 'slight' as const,
      edge: 1,
      hook: null,
      publicSupport: 'agree' as const,
      publicPct: 80,
      kickoff: '2026-09-05T19:00:00-04:00',
      id: 'loud',
    },
  ]
    .sort(compareRecommendationOrder)
    .map((row) => row.id)

  assert.deepEqual(ids, ['quiet', 'loud'])
})

test('within neutrals, public percentage does not rank picks', () => {
  const ids = [
    {
      category: 'neutral' as const,
      edge: 0,
      hook: null,
      publicSupport: 'none' as const,
      publicPct: 55,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'split',
    },
    {
      category: 'neutral' as const,
      edge: 0,
      hook: null,
      publicSupport: 'none' as const,
      publicPct: 75,
      kickoff: '2026-09-05T19:00:00-04:00',
      id: 'heavy',
    },
  ]
    .sort(compareRecommendationOrder)
    .map((row) => row.id)

  assert.deepEqual(ids, ['split', 'heavy'])
})

test('rest and travel are capped at one combined spread point', () => {
  const result = recommendationAdjustment({
    recommendedSide: null,
    edge: 0,
    travelRest: {
      awayRest: { days: 4, kind: 'short', label: 'Short week (4d)' },
      homeRest: { days: 14, kind: 'bye', label: 'Off a bye (14d)' },
      awayTravel: { zones: 3, direction: 'east', label: '3 time zones east' },
      homeTravel: null,
    },
  })

  assert.equal(result.rest, 0.75)
  assert.equal(result.travel, 0.75)
  assert.equal(result.context, 1)
  assert.equal(result.injury, 0)
  assert.equal(result.total, 1)
  assert.equal(result.pickedSide, 'home')
})

test('the grading scale quotes the same hook values the math uses', () => {
  const row = (factor: string) =>
    COMPOSITE_EDGE_SCALE.find((entry) => entry.factor === factor)?.value
  assert.equal(row('FG hook (3)'), `±${FG_HOOK_POINTS.toFixed(2)}`)
  assert.equal(row('TD hook (7)'), `±${TD_HOOK_POINTS.toFixed(2)}`)
  assert.equal(row('NFL first-team Out'), '−0.25 each')
  assert.equal(row('Rest + travel cap'), '±1.00')
})

function injuryTeam(
  abbrev: string,
  tiers: Array<NflStarterInjuryTeam['injuries'][number]['tier']>,
): NflStarterInjuryTeam {
  return {
    abbrev,
    name: abbrev,
    espnTeamId: '1',
    depthChartAt: null,
    status: 'ok',
    injuries: tiers.map((tier, index) => ({
      athleteId: String(index),
      name: `Player ${index}`,
      position: 'WR',
      status: tier,
      tier,
      injury: 'Knee',
      detail: null,
      updatedAt: null,
    })),
  }
}

test('first-team injury load is small and capped per team', () => {
  assert.equal(INJURY_TIER_POINTS.out, 0.25)
  assert.equal(MAX_TEAM_INJURY_ADJUSTMENT, 0.5)
  assert.equal(teamInjuryLoad(injuryTeam('KC', ['out'])), 0.25)
  assert.equal(teamInjuryLoad(injuryTeam('KC', ['out', 'out'])), 0.5)
  assert.equal(
    teamInjuryLoad(
      injuryTeam('KC', [
        'questionable',
        'questionable',
        'questionable',
        'questionable',
        'questionable',
        'questionable',
        'questionable',
        'questionable',
        'questionable',
        'questionable',
      ]),
    ),
    0.5,
  )
  assert.equal(
    injuryAdjustment(injuryTeam('KC', ['out']), injuryTeam('BUF', [])),
    0.25,
  )
  assert.equal(
    injuryAdjustment(injuryTeam('KC', []), injuryTeam('BUF', ['doubtful'])),
    -0.15,
  )
})

test('a first-team Out can break a true-neutral NFL game', () => {
  const result = resolveCardPick({
    category: 'neutral',
    recommendedSide: null,
    edge: 0,
    homeSpread: -3,
    liveHomeSpread: -3,
    consensus: undefined,
    injuries: {
      away: injuryTeam('KC', ['out']),
      home: injuryTeam('BUF', []),
    },
  })
  assert.equal(result.pickedSide, 'home')
  assert.equal(result.compositeEdge, 0.25)
  assert.equal(result.detail, 'injuries +0.25 · 0.25-point net edge')
})

test('FG and TD hooks add or subtract spread-point value for home', () => {
  assert.equal(FG_HOOK_POINTS, 0.5)
  assert.equal(TD_HOOK_POINTS, 0.75)
  assert.equal(hookAdjustment(-2.5), 0.5)
  assert.equal(hookAdjustment(3.5), 0.5)
  assert.equal(hookAdjustment(-3.5), -0.5)
  assert.equal(hookAdjustment(2.5), -0.5)
  assert.equal(hookAdjustment(-6.5), 0.75)
  assert.equal(hookAdjustment(7.5), 0.75)
  assert.equal(hookAdjustment(-7.5), -0.75)
  assert.equal(hookAdjustment(6.5), -0.75)
  assert.equal(hookAdjustment(-3), 0)
})

test('a true neutral FG hook picks its favorable side', () => {
  const result = resolveCardPick({
    category: 'neutral',
    recommendedSide: null,
    edge: 0,
    homeSpread: -3.5,
    liveHomeSpread: -3.5,
    consensus: undefined,
  })

  assert.equal(result.pickedSide, 'away')
  assert.equal(result.poolSpread, 3.5)
  assert.equal(result.source, 'line-value')
  assert.equal(result.hook, 'fg')
  assert.equal(result.compositeEdge, 0.5)
  assert.equal(result.strength, 'solid')
  assert.equal(result.score, 6)
  assert.equal(result.detail, 'FG hook +0.5 · 0.5-point net edge')
})

test('a favorable hook boosts a slight and an unfavorable hook suppresses it', () => {
  const favorable = resolveCardPick({
    category: 'slight',
    recommendedSide: 'home',
    edge: 1,
    homeSpread: -2.5,
    liveHomeSpread: -3.5,
    consensus: undefined,
  })
  const unfavorable = resolveCardPick({
    category: 'slight',
    recommendedSide: 'home',
    edge: 1,
    homeSpread: -3.5,
    liveHomeSpread: -4.5,
    consensus: undefined,
  })

  assert.equal(favorable.compositeEdge, 1.5)
  assert.equal(favorable.score, 6)
  assert.equal(favorable.hook, 'fg')
  assert.equal(
    favorable.detail,
    '1-point line value · FG hook +0.5 · 1.5-point net edge',
  )
  assert.equal(unfavorable.compositeEdge, 0.5)
  assert.equal(unfavorable.score, 1.5)
  assert.equal(unfavorable.hook, null)
  assert.equal(
    unfavorable.detail,
    '1-point line value · FG hook -0.5 · 0.5-point net edge',
  )
})

test('hook value does not recommend a game before DraftKings is available', () => {
  const result = resolveCardPick({
    category: 'pending',
    recommendedSide: null,
    edge: null,
    homeSpread: -3.5,
    liveHomeSpread: null,
    consensus: undefined,
  })

  assert.equal(result.pickedSide, null)
  assert.equal(result.source, null)
})

test('farther travel receives a larger suppression than short travel', () => {
  const oneZone = recommendationAdjustment({
    recommendedSide: null,
    edge: 0,
    travelRest: {
      awayRest: null,
      homeRest: null,
      awayTravel: null,
      homeTravel: { zones: 1, direction: 'east', label: '1 time zone east' },
    },
  })
  const threeZones = recommendationAdjustment({
    recommendedSide: null,
    edge: 0,
    travelRest: {
      awayRest: null,
      homeRest: null,
      awayTravel: null,
      homeTravel: { zones: 3, direction: 'east', label: '3 time zones east' },
    },
  })

  assert.equal(oneZone.travel, -0.25)
  assert.equal(threeZones.travel, -0.75)
})

test('rest and travel can overturn only a thin line edge', () => {
  const result = resolveCardPick({
    category: 'slight',
    recommendedSide: 'home',
    edge: 0.5,
    homeSpread: -3,
    liveHomeSpread: -3.5,
    consensus: consensus(10, 90),
    travelRest: {
      awayRest: null,
      homeRest: null,
      awayTravel: null,
      homeTravel: { zones: 3, direction: 'west', label: '3 time zones west' },
    },
  })

  assert.equal(result.pickedSide, 'away')
  assert.equal(result.source, 'rest-travel')
  assert.equal(result.compositeEdge, 0.25)
  assert.equal(result.publicSupport, 'fade')
})

test('public consensus cannot fill a game with no modeled advantage', () => {
  const result = resolveCardPick({
    category: 'neutral',
    recommendedSide: null,
    edge: 0,
    homeSpread: -3,
    liveHomeSpread: -3,
    consensus: consensus(10, 90),
  })

  assert.equal(result.pickedSide, null)
  assert.equal(result.source, null)
  assert.equal(
    result.skipReason,
    'No line-value, hook, injury, rest, or travel advantage',
  )
})

test('recommendation sort keeps a hook slight in its point band below a 1-point slight', () => {
  const ids = [
    {
      category: 'neutral' as const,
      edge: 0,
      hook: null,
      publicSupport: 'agree' as const,
      publicPct: 80,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'public-fill',
    },
    {
      category: 'slight' as const,
      edge: 0.5,
      hook: 'fg' as const,
      publicSupport: 'agree' as const,
      publicPct: 70,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'hook-slight',
    },
    {
      category: 'slight' as const,
      edge: 1,
      hook: null,
      publicSupport: 'none' as const,
      publicPct: 55,
      kickoff: '2026-09-05T19:00:00-04:00',
      id: 'one-point-slight',
    },
    {
      category: 'lean' as const,
      edge: 1.5,
      hook: null,
      publicSupport: 'fade' as const,
      publicPct: 40,
      kickoff: '2026-09-05T15:00:00-04:00',
      id: 'lean',
    },
  ]
    .sort(compareRecommendationOrder)
    .map((row) => row.id)

  assert.deepEqual(ids, [
    'lean',
    'one-point-slight',
    'hook-slight',
    'public-fill',
  ])
})

test('hook points boost recommendation order inside the slight band', () => {
  const ids = [
    {
      category: 'slight' as const,
      edge: 1,
      compositeEdge: 1,
      hook: null,
      publicSupport: 'none' as const,
      publicPct: null,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'one-point',
    },
    {
      category: 'slight' as const,
      edge: 0.5,
      compositeEdge: 1.25,
      hook: 'td' as const,
      publicSupport: 'none' as const,
      publicPct: null,
      kickoff: '2026-09-05T19:00:00-04:00',
      id: 'half-plus-td-hook',
    },
    {
      category: 'slight' as const,
      edge: 1,
      compositeEdge: 0.5,
      hook: null,
      publicSupport: 'none' as const,
      publicPct: null,
      kickoff: '2026-09-05T15:00:00-04:00',
      id: 'one-minus-fg-hook',
    },
  ]
    .sort(compareRecommendationOrder)
    .map((row) => row.id)

  assert.deepEqual(ids, [
    'half-plus-td-hook',
    'one-point',
    'one-minus-fg-hook',
  ])
})

test('classifyEdge puts 4+ in lock and keeps 3 / 3.5 as hammer', () => {
  assert.equal(classifyEdge(4), 'lock')
  assert.equal(classifyEdge(4.5), 'lock')
  assert.equal(classifyEdge(3.5), 'hammer')
  assert.equal(classifyEdge(3), 'hammer')
  assert.equal(classifyEdge(2.5), 'lean')
  assert.equal(classifyEdge(1), 'slight')
})

test('an FG hook is a 1-point slight, not a lock or hammer', () => {
  assert.equal(favorableHook(-2.5, -3.5), 'fg')
  assert.equal(classifyEdge(1), 'slight')
})

test('keyNumberHook flags FG and TD hooks without picking a side', () => {
  assert.equal(keyNumberHook(-3.5), 'fg')
  assert.equal(keyNumberHook(2.5), 'fg')
  assert.equal(keyNumberHook(7.5), 'td')
  assert.equal(keyNumberHook(-6.5), 'td')
  assert.equal(keyNumberHook(-3), null)
  assert.equal(keyNumberHook(-7), null)
  assert.equal(keyNumberHook(-8.5), null)
})

test('unfavorableHook flags the bad side of 3 and 7 on the recommended number', () => {
  assert.equal(unfavorableHook(-7.5), 'td')
  assert.equal(unfavorableHook(6.5), 'td')
  assert.equal(unfavorableHook(-3.5), 'fg')
  assert.equal(unfavorableHook(2.5), 'fg')
  assert.equal(unfavorableHook(-8.5), null)
  assert.equal(unfavorableHook(-6.5), null)
  assert.equal(unfavorableHook(7.5), null)
  assert.equal(favorableHook(-7.5, -8.5), null)
})

test('recommendation sort ranks a lock above a hammer', () => {
  const ids = [
    {
      category: 'hammer' as const,
      edge: 3.5,
      hook: null,
      publicSupport: 'agree' as const,
      publicPct: 80,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'hammer',
    },
    {
      category: 'lock' as const,
      edge: 4,
      hook: null,
      publicSupport: 'fade' as const,
      publicPct: 40,
      kickoff: '2026-09-05T19:00:00-04:00',
      id: 'lock',
    },
  ]
    .sort(compareRecommendationOrder)
    .map((row) => row.id)

  assert.deepEqual(ids, ['lock', 'hammer'])
})

test('inside the same edge, a TD hook ranks above an FG hook and either ranks above no hook', () => {
  const ids = [
    {
      category: 'slight' as const,
      edge: 1,
      hook: null,
      publicSupport: 'agree' as const,
      publicPct: 80,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'no-hook',
    },
    {
      category: 'slight' as const,
      edge: 1,
      hook: 'fg' as const,
      publicSupport: 'fade' as const,
      publicPct: 40,
      kickoff: '2026-09-05T15:00:00-04:00',
      id: 'fg-hook',
    },
    {
      category: 'slight' as const,
      edge: 1,
      hook: 'td' as const,
      publicSupport: 'none' as const,
      publicPct: 55,
      kickoff: '2026-09-05T19:00:00-04:00',
      id: 'td-hook',
    },
  ]
    .sort(compareRecommendationOrder)
    .map((row) => row.id)

  assert.deepEqual(ids, ['td-hook', 'fg-hook', 'no-hook'])
})
