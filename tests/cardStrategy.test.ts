import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareCardPicks,
  compareRecommendationOrder,
  publicSupportForSide,
} from '../src/cardScoring.ts'
import type { ConsensusGame } from '../src/types.ts'

function pick(
  overrides: Partial<{
    gameId: string
    source: 'line-value' | 'public-consensus'
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

test('public agreement lifts a line-value play only inside its own band', () => {
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
    ['fade-lean', 'agree-slight', 'fade-slight'],
  )
})

test('publicSupportForSide agrees when the Covers bucket matches the pick', () => {
  const matched = consensus(20, 80)
  assert.equal(publicSupportForSide(matched, -3, 'home'), 'agree')
  assert.equal(publicSupportForSide(matched, -3, 'away'), 'fade')
  assert.equal(publicSupportForSide(undefined, -3, 'home'), 'none')
})

test('within a 1-point slight band, higher public % on the picked side ranks first', () => {
  const quiet = consensus(40, 60)
  const loud = consensus(20, 80)
  const ids = [
    {
      category: 'slight' as const,
      edge: 1,
      recommendedSide: 'home' as const,
      homeSpread: -3,
      consensus: quiet,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'quiet',
    },
    {
      category: 'slight' as const,
      edge: 1,
      recommendedSide: 'home' as const,
      homeSpread: -3,
      consensus: loud,
      kickoff: '2026-09-05T19:00:00-04:00',
      id: 'loud',
    },
  ]
    .sort(compareRecommendationOrder)
    .map((row) => row.id)

  assert.deepEqual(ids, ['loud', 'quiet'])
})

test('within neutrals, the higher near-pool public leader ranks first', () => {
  const split = consensus(45, 55)
  const heavy = consensus(25, 75)
  const ids = [
    {
      category: 'neutral' as const,
      edge: 0,
      recommendedSide: null,
      homeSpread: -3,
      consensus: split,
      kickoff: '2026-09-05T12:00:00-04:00',
      id: 'split',
    },
    {
      category: 'neutral' as const,
      edge: 0,
      recommendedSide: null,
      homeSpread: -3,
      consensus: heavy,
      kickoff: '2026-09-05T19:00:00-04:00',
      id: 'heavy',
    },
  ]
    .sort(compareRecommendationOrder)
    .map((row) => row.id)

  assert.deepEqual(ids, ['heavy', 'split'])
})

test('card strength sort uses public % after agree/none/fade inside a band', () => {
  assert.deepEqual(
    orderedIds([
      pick({
        gameId: 'quiet-agree',
        publicSupport: 'agree',
        publicPct: 55,
        score: 3,
      }),
      pick({
        gameId: 'loud-agree',
        publicSupport: 'agree',
        publicPct: 72,
        score: 3,
        kickoff: '2026-09-05T19:00:00-04:00',
      }),
    ]),
    ['loud-agree', 'quiet-agree'],
  )
})
