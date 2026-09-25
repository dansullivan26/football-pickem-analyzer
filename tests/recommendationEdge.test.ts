import assert from 'node:assert/strict'
import test from 'node:test'
import {
  largestNetEdgePlay,
  netEdgeBucketId,
  recommendationNetEdge,
  summarizeNetEdgeBuckets,
} from '../src/recommendationEdge.ts'
import type { FrozenRecommendation } from '../src/types.ts'

function rec(
  overrides: Partial<FrozenRecommendation> & Pick<FrozenRecommendation, 'cbsEventId'>,
): FrozenRecommendation {
  return {
    sport: 'NFL',
    kickoff: '2026-09-20T13:00:00-04:00',
    away: 'AWAY',
    home: 'HOME',
    homeSpread: -3.5,
    liveHomeSpread: -3.5,
    category: 'slight',
    recommendedSide: 'home',
    hook: 'fg',
    cover: 'home',
    source: 'line-value',
    pickedSide: 'home',
    strength: 'mild',
    score: 3,
    ...overrides,
  }
}

test('recommendationNetEdge prefers the stored composite', () => {
  const measured = recommendationNetEdge(
    rec({ cbsEventId: 1, compositeEdge: 2.75, liveHomeSpread: 0 }),
  )
  assert.deepEqual(measured, { net: 2.75, stored: true })
  assert.equal(netEdgeBucketId(2.75), 'lean')
})

test('recommendationNetEdge reconstructs line value plus the hook', () => {
  const measured = recommendationNetEdge(
    rec({
      cbsEventId: 2,
      homeSpread: -3.5,
      liveHomeSpread: -1,
      hook: 'fg',
    }),
  )
  assert.ok(measured)
  assert.equal(measured.stored, false)
  assert.equal(measured.net, 3)
  assert.equal(netEdgeBucketId(measured.net), 'hammer')
})

test('summarizeNetEdgeBuckets grades the line-value side in each band', () => {
  const stats = summarizeNetEdgeBuckets([
    rec({ cbsEventId: 1, compositeEdge: 0.1, recommendedSide: 'away', cover: 'home' }),
    rec({ cbsEventId: 2, compositeEdge: 0.8, cover: 'home' }),
    rec({ cbsEventId: 3, compositeEdge: 2, cover: 'away' }),
    rec({ cbsEventId: 4, compositeEdge: 3.2, cover: 'home' }),
    rec({ cbsEventId: 5, compositeEdge: 4.5, cover: 'home' }),
    rec({ cbsEventId: 6, category: 'pending', liveHomeSpread: null, recommendedSide: null }),
  ])
  const byId = Object.fromEntries(stats.map((row) => [row.id, row]))
  assert.equal(byId['below-floor']?.detail, '0-1 ATS')
  assert.equal(byId.thin?.detail, '1-0 ATS')
  assert.equal(byId.lean?.detail, '0-1 ATS')
  assert.equal(byId.hammer?.detail, '1-0 ATS')
  assert.equal(byId.lock?.detail, '1-0 ATS')
})

test('largestNetEdgePlay is the recommended side with the fattest net', () => {
  const play = largestNetEdgePlay([
    rec({ cbsEventId: 1, compositeEdge: 1.2, away: 'KC', recommendedSide: 'away' }),
    rec({
      cbsEventId: 2,
      compositeEdge: 4.2,
      away: 'IND',
      homeSpread: -20.5,
      recommendedSide: 'home',
    }),
    rec({ cbsEventId: 3, compositeEdge: 3.9, recommendedSide: null }),
  ])
  assert.equal(play?.game.cbsEventId, 2)
  assert.equal(play?.net, 4.2)
})
