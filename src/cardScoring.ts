import type { ConsensusGame, EdgeCategory } from './types'

export const PCT_PER_SPREAD_POINT = 3
export const MAX_PUBLIC_BUCKET_DISTANCE = 1
export const MIN_PUBLIC_BUCKET_PICKS = 10
export const MIN_PUBLIC_BUCKET_SHARE = 0.05

export const CARD_STRATEGY_NOTE =
  'Any line-value pick (hammer / lean / slight) ranks above every public-only pick, including a strong Covers majority. A favorable FG (2.5/3.5) or TD (6.5/7.5) hook is still line value and badges as solid; Recommendation sort still keeps it in its point band, same as Lines. Public is a within-band modifier: inside the same edge, the higher near-pool public % on the picked side ranks first (agreement floats up, fade sinks). Games with no line value can still fill from a meaningful Covers bucket within 1 point of the pool line, but those picks always sit below the slights. Strength is mild under 6, solid 6–11, strong 12+.'

export const LINE_VALUE_CATEGORIES = new Set<EdgeCategory>([
  'hammer',
  'lean',
  'slight',
])

export type PickStrength = 'mild' | 'solid' | 'strong'
export type CardPickSource = 'line-value' | 'public-consensus'
export type HookKind = 'fg' | 'td'
export type PublicSupport = 'agree' | 'none' | 'fade'

export const STRENGTH_RANK: Record<PickStrength, number> = {
  strong: 3,
  solid: 2,
  mild: 1,
}

export const PUBLIC_SUPPORT_RANK: Record<PublicSupport, number> = {
  agree: 2,
  none: 1,
  fade: 0,
}

export const CATEGORY_RANK: Record<EdgeCategory, number> = {
  hammer: 0,
  lean: 1,
  slight: 2,
  neutral: 3,
  pending: 4,
}

export type ResolvedCardPick = {
  source: CardPickSource | null
  pickedSide: 'home' | 'away' | null
  strength: PickStrength | null
  score: number | null
  poolSpread: number | null
  detail: string | null
  skipReason: string | null
  hook: HookKind | null
  publicSupport: PublicSupport
  /** Near-pool bucket % on the picked side, or the leader % when there is no side. */
  publicPct: number | null
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

export function publicBucketForPool(
  consensus: ConsensusGame,
  poolHomeSpread = consensus.cbsHomeSpread,
) {
  const buckets = consensus.atsByLine ?? []
  const allPicks = buckets.reduce(
    (sum, row) => sum + row.awayPicks + row.homePicks,
    0,
  )
  const minimumPicks = Math.max(
    MIN_PUBLIC_BUCKET_PICKS,
    Math.ceil(allPicks * MIN_PUBLIC_BUCKET_SHARE),
  )
  const poolAwaySpread = -poolHomeSpread

  return (
    [...buckets]
      .filter((row) => {
        const rowPicks = row.awayPicks + row.homePicks
        return (
          rowPicks >= minimumPicks &&
          Math.abs(row.awaySpread - poolAwaySpread) <=
            MAX_PUBLIC_BUCKET_DISTANCE
        )
      })
      .sort((left, right) => {
        const distance =
          Math.abs(left.awaySpread - poolAwaySpread) -
          Math.abs(right.awaySpread - poolAwaySpread)
        if (distance) return distance
        return (
          right.awayPicks +
          right.homePicks -
          (left.awayPicks + left.homePicks)
        )
      })[0] ?? null
  )
}

export function favorableHook(
  poolHome: number,
  bookHome: number,
): HookKind | null {
  // The .5 on either side of a field goal (3) or touchdown (7). Same sign,
  // both non-zero: the pool side of that pair is the hook.
  if (poolHome === 0 || bookHome === 0) return null
  if (Math.sign(poolHome) !== Math.sign(bookHome)) return null

  const pair = new Set([Math.abs(poolHome), Math.abs(bookHome)])
  if (pair.has(2.5) && pair.has(3.5)) return 'fg'
  if (pair.has(6.5) && pair.has(7.5)) return 'td'
  return null
}

const HOOK_SOLID_FLOOR = 6

export function lineValueScore(
  category: EdgeCategory,
  edge: number,
  hook: HookKind | null = null,
) {
  let score = edge * PCT_PER_SPREAD_POINT
  if (category === 'hammer') score = 12 + (edge - 3) * PCT_PER_SPREAD_POINT
  else if (category === 'lean') score = 6 + (edge - 1.5) * 4
  if (hook && score < HOOK_SOLID_FLOOR) return HOOK_SOLID_FLOOR
  return score
}

export function lineValueStrength(
  category: EdgeCategory,
  hook: HookKind | null = null,
): PickStrength {
  if (category === 'hammer') return 'strong'
  if (category === 'lean' || hook) return 'solid'
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
  poolHomeSpread: number,
) {
  const bucket = publicBucketForPool(consensus, poolHomeSpread)
  if (!bucket) {
    return {
      ok: false as const,
      reason: 'No meaningful Covers ticket bucket within 1 point of the pool line',
    }
  }

  if (bucket.awayPicks === bucket.homePicks) {
    return {
      ok: false as const,
      reason: `Covers public is split at ${formatPoolSpread(bucket.awaySpread)}`,
    }
  }

  const side =
    bucket.awayPicks > bucket.homePicks ? ('away' as const) : ('home' as const)
  const leaderPicks =
    side === 'away' ? bucket.awayPicks : bucket.homePicks
  const otherPicks = side === 'away' ? bucket.homePicks : bucket.awayPicks
  const pct = (leaderPicks / (leaderPicks + otherPicks)) * 100
  const poolSpread = poolSpreadForSide(poolHomeSpread, side)
  const coversSpread =
    side === 'away' ? bucket.awaySpread : -bucket.awaySpread
  const gap = poolSpread - coversSpread
  const score = pct - 50 + PCT_PER_SPREAD_POINT * gap
  const roundedPct = Math.round(pct)
  const detail = `${roundedPct}% (${leaderPicks}–${otherPicks}) at Covers ${formatPoolSpread(coversSpread)} · ${gapPhrase(gap)}`

  if (score <= 0) {
    const needed = Math.ceil(50 - PCT_PER_SPREAD_POINT * gap)
    return {
      ok: false as const,
      reason: `Public ${roundedPct}% at Covers ${formatPoolSpread(coversSpread)}; need ${needed}% for the pool number`,
    }
  }

  return {
    ok: true as const,
    side,
    strength: classifyPublicScore(score),
    score,
    detail,
    poolSpread,
  }
}

export function publicSupportForSide(
  consensus: ConsensusGame | undefined,
  homeSpread: number,
  side: 'home' | 'away' | null,
): PublicSupport {
  if (!side || consensus?.matchStatus !== 'matched') return 'none'
  const publicPick = evaluatePublicPick(consensus, homeSpread)
  if (!publicPick.ok) return 'none'
  return publicPick.side === side ? 'agree' : 'fade'
}

/** Near-pool Covers % used to order games inside the same line-value band. */
export function publicPctForSort(
  consensus: ConsensusGame | undefined,
  homeSpread: number,
  side: 'home' | 'away' | null,
): number | null {
  if (consensus?.matchStatus !== 'matched') return null
  const bucket = publicBucketForPool(consensus, homeSpread)
  if (!bucket) return null
  const total = bucket.awayPicks + bucket.homePicks
  if (total <= 0) return null
  if (side === 'away') return (bucket.awayPicks / total) * 100
  if (side === 'home') return (bucket.homePicks / total) * 100
  return (Math.max(bucket.awayPicks, bucket.homePicks) / total) * 100
}

export function compareCardPicks(
  left: {
    source: CardPickSource
    strength: PickStrength
    publicSupport: PublicSupport
    publicPct?: number | null
    score: number
    kickoff: string
  },
  right: {
    source: CardPickSource
    strength: PickStrength
    publicSupport: PublicSupport
    publicPct?: number | null
    score: number
    kickoff: string
  },
) {
  if (left.source !== right.source) {
    return left.source === 'line-value' ? -1 : 1
  }
  const strength = STRENGTH_RANK[right.strength] - STRENGTH_RANK[left.strength]
  if (strength) return strength
  const publicSupport =
    PUBLIC_SUPPORT_RANK[right.publicSupport] -
    PUBLIC_SUPPORT_RANK[left.publicSupport]
  if (publicSupport) return publicSupport
  const publicPct = (right.publicPct ?? -1) - (left.publicPct ?? -1)
  if (publicPct) return publicPct
  if (right.score !== left.score) return right.score - left.score
  return left.kickoff.localeCompare(right.kickoff)
}

export type RecommendationOrderKey = {
  category: EdgeCategory
  edge: number | null
  publicSupport: PublicSupport
  publicPct: number | null
  kickoff: string
}

export function recommendationOrderKey(input: {
  category: EdgeCategory
  edge: number | null
  recommendedSide: 'home' | 'away' | null
  homeSpread: number
  consensus: ConsensusGame | undefined
  kickoff: string
}): RecommendationOrderKey {
  return {
    category: input.category,
    edge: input.edge,
    publicSupport: publicSupportForSide(
      input.consensus,
      input.homeSpread,
      input.recommendedSide,
    ),
    publicPct: publicPctForSort(
      input.consensus,
      input.homeSpread,
      input.recommendedSide,
    ),
    kickoff: input.kickoff,
  }
}

export function compareRecommendationOrder(
  left: RecommendationOrderKey,
  right: RecommendationOrderKey,
) {
  const category = CATEGORY_RANK[left.category] - CATEGORY_RANK[right.category]
  if (category) return category
  const edge = (right.edge ?? -1) - (left.edge ?? -1)
  if (edge) return edge
  const publicSupport =
    PUBLIC_SUPPORT_RANK[right.publicSupport] -
    PUBLIC_SUPPORT_RANK[left.publicSupport]
  if (publicSupport) return publicSupport
  const publicPct = (right.publicPct ?? -1) - (left.publicPct ?? -1)
  if (publicPct) return publicPct
  return left.kickoff.localeCompare(right.kickoff)
}

export function resolveCardPick(input: {
  category: EdgeCategory
  recommendedSide: 'home' | 'away' | null
  edge: number | null
  homeSpread: number
  liveHomeSpread?: number | null
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
    hook: null,
    publicSupport: 'none',
    publicPct: null,
  }

  const hook =
    input.liveHomeSpread == null
      ? null
      : favorableHook(input.homeSpread, input.liveHomeSpread)

  if (LINE_VALUE_CATEGORIES.has(input.category) && input.recommendedSide) {
    const edge = input.edge ?? 0
    const hookNote = hook ? ` · favorable ${hook === 'fg' ? 'FG' : 'TD'} hook` : ''
    return {
      source: 'line-value',
      pickedSide: input.recommendedSide,
      strength: lineValueStrength(input.category, hook),
      score: lineValueScore(input.category, edge, hook),
      poolSpread: poolSpreadForSide(input.homeSpread, input.recommendedSide),
      detail:
        (input.edge == null
          ? `${input.category} on the pool number`
          : `${formatPoints(input.edge)}-point ${input.category} on the pool number`) +
        hookNote,
      skipReason: null,
      hook,
      publicSupport: publicSupportForSide(
        input.consensus,
        input.homeSpread,
        input.recommendedSide,
      ),
      publicPct: publicPctForSort(
        input.consensus,
        input.homeSpread,
        input.recommendedSide,
      ),
    }
  }

  if (input.consensus?.matchStatus === 'matched') {
    const publicPick = evaluatePublicPick(input.consensus, input.homeSpread)
    if (publicPick.ok) {
      return {
        source: 'public-consensus',
        pickedSide: publicPick.side,
        strength: publicPick.strength,
        score: publicPick.score,
        poolSpread: publicPick.poolSpread,
        detail: publicPick.detail,
        skipReason: null,
        hook: null,
        publicSupport: 'agree',
        publicPct: publicPctForSort(
          input.consensus,
          input.homeSpread,
          publicPick.side,
        ),
      }
    }
    return { ...empty, skipReason: publicPick.reason }
  }

  return empty
}
