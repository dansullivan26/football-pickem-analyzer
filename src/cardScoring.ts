import type { ConsensusGame, EdgeCategory } from './types'

export const PCT_PER_SPREAD_POINT = 3

export const CARD_STRATEGY_NOTE =
  'Line-value picks (hammer / lean / slight) come first. Public fallback needs (public% − 50) + 3 × (pool number − Covers number) above 0; worse Covers-to-pool gaps need a bigger majority. Strength is that score: mild under 6, solid 6–11, strong 12+.'

export const LINE_VALUE_CATEGORIES = new Set<EdgeCategory>([
  'hammer',
  'lean',
  'slight',
])

export type PickStrength = 'mild' | 'solid' | 'strong'
export type CardPickSource = 'line-value' | 'public-consensus'

export type ResolvedCardPick = {
  source: CardPickSource | null
  pickedSide: 'home' | 'away' | null
  strength: PickStrength | null
  score: number | null
  poolSpread: number | null
  detail: string | null
  skipReason: string | null
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatPoolSpread(value: number) {
  if (value === 0) return 'PK'
  const points = formatPoints(Math.abs(value))
  return value > 0 ? `+${points}` : `-${points}`
}

export function poolSpreadForSide(homeSpread: number, side: 'home' | 'away') {
  return homeSpread * (side === 'away' ? -1 : 1)
}

export function publicConsensusSide(consensus: ConsensusGame | undefined) {
  if (!consensus || consensus.matchStatus !== 'matched') return null
  const { away, home } = consensus
  if (away.pct == null || home.pct == null) return null
  if (away.pct === home.pct) return null
  return home.pct > away.pct ? ('home' as const) : ('away' as const)
}

export function lineValueScore(category: EdgeCategory, edge: number) {
  if (category === 'hammer') return 12 + (edge - 3) * PCT_PER_SPREAD_POINT
  if (category === 'lean') return 6 + (edge - 1.5) * 4
  return edge * PCT_PER_SPREAD_POINT
}

export function lineValueStrength(category: EdgeCategory): PickStrength {
  if (category === 'hammer') return 'strong'
  if (category === 'lean') return 'solid'
  return 'mild'
}

export function classifyPublicScore(score: number): PickStrength {
  if (score >= 12) return 'strong'
  if (score >= 6) return 'solid'
  return 'mild'
}

function gapPhrase(gap: number) {
  if (Math.abs(gap) < 0.05) return 'same number as the pool'
  const points = formatPoints(Math.abs(gap))
  const unit = Math.abs(gap) === 1 ? 'point' : 'points'
  if (gap > 0) return `pool is ${points} ${unit} better`
  return `public voted at a ${points}-point worse number`
}

export function evaluatePublicPick(
  consensus: ConsensusGame,
  side: 'home' | 'away',
  poolHomeSpread: number,
) {
  const leader = consensus[side]
  const pct = leader.pct ?? 0
  const poolSpread = poolSpreadForSide(poolHomeSpread, side)
  const gap = leader.spread == null ? 0 : poolSpread - leader.spread
  const score = pct - 50 + PCT_PER_SPREAD_POINT * gap
  const coversLine =
    leader.spread == null ? '' : ` at Covers ${formatPoolSpread(leader.spread)}`
  const detail = `${pct}%${coversLine} · ${gapPhrase(gap)}`

  if (score <= 0) {
    const worse = Math.abs(gap)
    const needed = Math.ceil(50 + PCT_PER_SPREAD_POINT * worse)
    return {
      ok: false as const,
      reason: `Public ${pct}%${coversLine}; need ${needed}% to cover the ${formatPoints(worse)}-point worse pool number`,
    }
  }

  return {
    ok: true as const,
    strength: classifyPublicScore(score),
    score,
    detail,
    poolSpread,
  }
}

export function resolveCardPick(input: {
  category: EdgeCategory
  recommendedSide: 'home' | 'away' | null
  edge: number | null
  homeSpread: number
  consensus: ConsensusGame | undefined
}): ResolvedCardPick {
  const empty: ResolvedCardPick = {
    source: null,
    pickedSide: null,
    strength: null,
    score: null,
    poolSpread: null,
    detail: null,
    skipReason: null,
  }

  if (LINE_VALUE_CATEGORIES.has(input.category) && input.recommendedSide) {
    const edge = input.edge ?? 0
    return {
      source: 'line-value',
      pickedSide: input.recommendedSide,
      strength: lineValueStrength(input.category),
      score: lineValueScore(input.category, edge),
      poolSpread: poolSpreadForSide(input.homeSpread, input.recommendedSide),
      detail:
        input.edge == null
          ? `${input.category} on the pool number`
          : `${formatPoints(input.edge)}-point ${input.category} on the pool number`,
      skipReason: null,
    }
  }

  const publicSide = publicConsensusSide(input.consensus)
  if (publicSide && input.consensus) {
    const publicPick = evaluatePublicPick(
      input.consensus,
      publicSide,
      input.homeSpread,
    )
    if (publicPick.ok) {
      return {
        source: 'public-consensus',
        pickedSide: publicSide,
        strength: publicPick.strength,
        score: publicPick.score,
        poolSpread: publicPick.poolSpread,
        detail: publicPick.detail,
        skipReason: null,
      }
    }
    return { ...empty, skipReason: publicPick.reason }
  }

  return empty
}
