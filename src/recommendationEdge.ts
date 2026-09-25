import { hookAdjustment, MIN_COMPOSITE_EDGE } from './cardScoring.ts'
import type { FrozenRecommendation } from './types.ts'

export type NetEdgeBucketId =
  | 'below-floor'
  | 'thin'
  | 'lean'
  | 'hammer'
  | 'lock'

export type NetEdgeBucket = {
  id: NetEdgeBucketId
  label: string
  min: number
  max: number
  cardClass: 'slight' | 'lean' | 'hammer' | 'lock'
}

export const NET_EDGE_BUCKETS: NetEdgeBucket[] = [
  {
    id: 'below-floor',
    label: 'Below 0.25',
    min: 0,
    max: MIN_COMPOSITE_EDGE,
    cardClass: 'slight',
  },
  {
    id: 'thin',
    label: '0.25–1.5',
    min: MIN_COMPOSITE_EDGE,
    max: 1.5,
    cardClass: 'slight',
  },
  {
    id: 'lean',
    label: '1.5–3',
    min: 1.5,
    max: 3,
    cardClass: 'lean',
  },
  {
    id: 'hammer',
    label: '3–4',
    min: 3,
    max: 4,
    cardClass: 'hammer',
  },
  {
    id: 'lock',
    label: '4+',
    min: 4,
    max: Number.POSITIVE_INFINITY,
    cardClass: 'lock',
  },
]

export type NetEdgeStats = {
  id: NetEdgeBucketId
  label: string
  cardClass: NetEdgeBucket['cardClass']
  count: number
  wins: number
  losses: number
  pending: number
  rate: string
  detail: string
}

export type NetEdgePlay = {
  game: FrozenRecommendation
  net: number
  stored: boolean
}

function formatPoints(value: number) {
  if (Number.isInteger(value)) return String(value)
  const hundredths = Math.round(value * 100) / 100
  const tenths = Math.round(value * 10) / 10
  if (Math.abs(hundredths - tenths) < 1e-9) return tenths.toFixed(1)
  return hundredths.toFixed(2)
}

function formatRate(wins: number, losses: number) {
  const decided = wins + losses
  if (!decided) return '—'
  return `${Math.round((wins / decided) * 100)}%`
}

/**
 * Stored composite when the snapshot wrote one. Older weeks fall back to
 * line value plus the hook, which is the part of the net we can still see.
 */
export function recommendationNetEdge(game: FrozenRecommendation) {
  if (typeof game.compositeEdge === 'number' && Number.isFinite(game.compositeEdge)) {
    return {
      net: Math.abs(game.compositeEdge),
      stored: true,
    }
  }
  if (game.liveHomeSpread == null) return null
  if (game.category === 'pending') return null
  const line = game.homeSpread - game.liveHomeSpread
  const hook = hookAdjustment(game.homeSpread)
  return {
    net: Math.abs(line + hook),
    stored: false,
  }
}

export function netEdgeBucketId(net: number): NetEdgeBucketId {
  if (net + 1e-9 < MIN_COMPOSITE_EDGE) return 'below-floor'
  if (net < 1.5) return 'thin'
  if (net < 3) return 'lean'
  if (net < 4) return 'hammer'
  return 'lock'
}

export function summarizeNetEdgeBuckets(games: FrozenRecommendation[]) {
  const rows = games.map((game) => ({
    game,
    measured: recommendationNetEdge(game),
  }))
  return NET_EDGE_BUCKETS.map((bucket) => {
    const inBucket = rows.filter(({ measured }) => {
      if (!measured) return false
      return netEdgeBucketId(measured.net) === bucket.id
    })
    let wins = 0
    let losses = 0
    let pending = 0
    for (const { game } of inBucket) {
      if (!game.recommendedSide) {
        if (!game.cover) pending += 1
        continue
      }
      if (!game.cover || game.cover === 'push') {
        if (!game.cover) pending += 1
        continue
      }
      if (game.cover === game.recommendedSide) wins += 1
      else losses += 1
    }
    return {
      id: bucket.id,
      label: bucket.label,
      cardClass: bucket.cardClass,
      count: inBucket.length,
      wins,
      losses,
      pending,
      rate: formatRate(wins, losses),
      detail: `${wins}-${losses} ATS`,
    } satisfies NetEdgeStats
  })
}

export function largestNetEdgePlay(games: FrozenRecommendation[]): NetEdgePlay | null {
  const ranked = games
    .flatMap((game) => {
      if (!game.recommendedSide) return []
      const measured = recommendationNetEdge(game)
      if (!measured) return []
      return [{ game, net: measured.net, stored: measured.stored }]
    })
    .sort(
      (left, right) =>
        right.net - left.net ||
        left.game.cbsEventId - right.game.cbsEventId,
    )
  return ranked[0] ?? null
}

export function formatNetEdgePoints(value: number) {
  return formatPoints(value)
}
