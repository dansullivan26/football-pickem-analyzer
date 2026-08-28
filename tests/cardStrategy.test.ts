import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareCardPicks,
  publicSupportForSide,
} from '../src/cardScoring.ts'
import type { ConsensusGame } from '../src/types.ts'

function pick(
  overrides: Partial<{
    gameId: string
    source: 'line-value' | 'public-consensus'
    strength: 'mild' | 'solid' | 'strong'
    publicSupport: 'agree' | 'none' | 'fade'
    score: number
    kickoff: string
  }> & { gameId: string },
) {
  return {
    source: 'line-value' as const,
    strength: 'mild' as const,
    publicSupport: 'none' as const,
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
