import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyEdge,
  compareCardPicks,
  compareRecommendationOrder,
  favorableHook,
  keyNumberHook,
  recommendationAdjustment,
  resolveCardPick,
  unfavorableHook,
  publicSupportForSide,
} from '../src/cardScoring.ts'
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
  assert.equal(result.total, 1)
  assert.equal(result.pickedSide, 'home')
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
    'No line-value, rest, or travel advantage',
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
