import type { ConsensusGame, EdgeCategory } from './types.ts'
import type { GameTravelRest, SideRest, SideTravel } from './travelRest.ts'
import type {
  NflAvailabilityTier,
  NflStarterInjuryTeam,
} from './nflStarterInjuries.ts'

export const PCT_PER_SPREAD_POINT = 3
export const REST_POINTS_PER_DAY = 0.25
export const TRAVEL_POINTS_PER_ZONE = 0.25
export const MAX_REST_ADJUSTMENT = 0.75
export const MAX_TRAVEL_ADJUSTMENT = 0.75
export const MAX_CONTEXT_ADJUSTMENT = 1
export const FG_HOOK_POINTS = 0.5
export const TD_HOOK_POINTS = 0.75
export const INJURY_TIER_POINTS: Record<NflAvailabilityTier, number> = {
  out: 0.25,
  doubtful: 0.15,
  reserve: 0.2,
  questionable: 0.05,
}
export const MAX_TEAM_INJURY_ADJUSTMENT = 0.5
export const MAX_PUBLIC_BUCKET_DISTANCE = 1
export const MIN_PUBLIC_BUCKET_PICKS = 10
export const MIN_PUBLIC_BUCKET_SHARE = 0.05

export const CARD_STRATEGY_NOTE =
  'Line value is the primary signal. The favorable side of a field-goal hook adds 0.5 spread points and a touchdown hook adds 0.75; taking the unfavorable side subtracts the same amount. NFL first-team availability is a small signed term (Out 0.25, Doubtful 0.15, Reserve 0.20, Questionable 0.05), capped at 0.5 per team so a long report cannot run the card. Rest and travel can adjust the result by at most 1 spread point combined. Covers percentages remain visible but never select or rank a pick. A game stays unpicked when line value, hooks, injuries, rest, and travel produce no net advantage.'

export const LINE_VALUE_CATEGORIES = new Set<EdgeCategory>([
  'lock',
  'hammer',
  'lean',
  'slight',
])

export function classifyEdge(magnitude: number): EdgeCategory {
  if (magnitude >= 4) return 'lock'
  if (magnitude >= 3) return 'hammer'
  if (magnitude >= 1.5) return 'lean'
  if (magnitude > 0) return 'slight'
  return 'neutral'
}

export type PickStrength = 'mild' | 'solid' | 'strong'
export type CardPickSource =
  | 'line-value'
  | 'rest-travel'
  | 'public-consensus'
  | 'season-results'
  | 'pool-aware'
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

export const HOOK_RANK: Record<HookKind | 'none', number> = {
  td: 2,
  fg: 1,
  none: 0,
}

export const CATEGORY_RANK: Record<EdgeCategory, number> = {
  lock: 0,
  hammer: 1,
  lean: 2,
  slight: 3,
  neutral: 4,
  pending: 5,
}

export type ResolvedCardPick = {
  source: CardPickSource | null
  pickedSide: 'home' | 'away' | null
  strength: PickStrength | null
  score: number | null
  /** Net edge in spread-point equivalents after rest and travel. */
  compositeEdge: number | null
  poolSpread: number | null
  detail: string | null
  skipReason: string | null
  hook: HookKind | null
  publicSupport: PublicSupport
  /** Near-pool bucket % on the picked side, or the leader % when there is no side. */
  publicPct: number | null
}

export type RecommendationAdjustment = {
  /** Signed from the home side's perspective. */
  line: number
  /** Signed key-number value from the home side's perspective. */
  hook: number
  /** Signed from the home side's perspective. */
  rest: number
  /** Signed from the home side's perspective. */
  travel: number
  /** Signed NFL starter-availability value from the home side's perspective. */
  injury: number
  /** Applied rest + travel adjustment after the combined cap. */
  context: number
  /** Signed composite score from the home side's perspective. */
  total: number
  pickedSide: 'home' | 'away' | null
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function restValue(rest: SideRest | null | undefined) {
  if (!rest) return 0
  return clamp(
    (rest.days - 7) * REST_POINTS_PER_DAY,
    -MAX_REST_ADJUSTMENT,
    MAX_REST_ADJUSTMENT,
  )
}

function travelPenalty(travel: SideTravel | null | undefined) {
  if (!travel || travel.direction === 'same') return 0
  return Math.min(
    travel.zones * TRAVEL_POINTS_PER_ZONE,
    MAX_TRAVEL_ADJUSTMENT,
  )
}

export function teamInjuryLoad(
  team: NflStarterInjuryTeam | null | undefined,
) {
  if (!team || team.status !== 'ok') return 0
  const raw = team.injuries.reduce(
    (sum, row) => sum + INJURY_TIER_POINTS[row.tier],
    0,
  )
  return Math.min(MAX_TEAM_INJURY_ADJUSTMENT, Math.round(raw * 100) / 100)
}

/** Positive means the visitor is more dinged than the home team. */
export function injuryAdjustment(
  away: NflStarterInjuryTeam | null | undefined,
  home: NflStarterInjuryTeam | null | undefined,
) {
  return teamInjuryLoad(away) - teamInjuryLoad(home)
}

export function recommendationAdjustment(input: {
  recommendedSide: 'home' | 'away' | null
  edge: number | null
  homeSpread?: number
  travelRest?: GameTravelRest | null
  injuries?: {
    away?: NflStarterInjuryTeam | null
    home?: NflStarterInjuryTeam | null
  }
}): RecommendationAdjustment {
  const line =
    input.edge == null || !input.recommendedSide
      ? 0
      : input.edge * (input.recommendedSide === 'home' ? 1 : -1)
  const hook =
    input.homeSpread == null ? 0 : hookAdjustment(input.homeSpread)
  const rest = clamp(
    restValue(input.travelRest?.homeRest) -
      restValue(input.travelRest?.awayRest),
    -MAX_REST_ADJUSTMENT,
    MAX_REST_ADJUSTMENT,
  )
  const travel = clamp(
    travelPenalty(input.travelRest?.awayTravel) -
      travelPenalty(input.travelRest?.homeTravel),
    -MAX_TRAVEL_ADJUSTMENT,
    MAX_TRAVEL_ADJUSTMENT,
  )
  const context = clamp(
    rest + travel,
    -MAX_CONTEXT_ADJUSTMENT,
    MAX_CONTEXT_ADJUSTMENT,
  )
  const injury = injuryAdjustment(input.injuries?.away, input.injuries?.home)
  const total = line + hook + injury + context
  return {
    line,
    hook,
    rest,
    travel,
    injury,
    context,
    total,
    pickedSide: total > 0 ? 'home' : total < 0 ? 'away' : null,
  }
}

function formatPoints(value: number) {
  if (Number.isInteger(value)) return String(value)
  const hundredths = Math.round(value * 100) / 100
  const tenths = Math.round(value * 10) / 10
  if (Math.abs(hundredths - tenths) < 1e-9) return tenths.toFixed(1)
  return hundredths.toFixed(2)
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

/** Pool number sits on the bad side of 3 or 7 for the side we are taking. */
export function unfavorableHook(poolSpread: number): HookKind | null {
  if (poolSpread === -3.5 || poolSpread === 2.5) return 'fg'
  if (poolSpread === -7.5 || poolSpread === 6.5) return 'td'
  return null
}

/** CBS number is on a field-goal or touchdown hook, regardless of side. */
export function keyNumberHook(spread: number): HookKind | null {
  const points = Math.abs(spread)
  if (points === 2.5 || points === 3.5) return 'fg'
  if (points === 6.5 || points === 7.5) return 'td'
  return null
}

export function hookPointValue(kind: HookKind) {
  return kind === 'fg' ? FG_HOOK_POINTS : TD_HOOK_POINTS
}

/**
 * Signed from the home side's perspective. Positive means the CBS number
 * gives home the favorable side of 3 or 7; negative means away benefits.
 */
export function hookAdjustment(homeSpread: number) {
  const kind = keyNumberHook(homeSpread)
  if (!kind) return 0
  const value = hookPointValue(kind)
  return unfavorableHook(homeSpread) ? -value : value
}

export function favorableHookForSide(
  homeSpread: number,
  side: 'home' | 'away' | null,
) {
  if (!side) return null
  const kind = keyNumberHook(homeSpread)
  if (!kind) return null
  return unfavorableHook(poolSpreadForSide(homeSpread, side)) ? null : kind
}

export type CompositeScaleRow = {
  factor: string
  value: string
  detail: string
}

/** Every factor that can move the composite edge, in spread points. */
export const COMPOSITE_EDGE_SCALE: CompositeScaleRow[] = [
  {
    factor: 'Line value',
    value: '1.00 per point',
    detail: `CBS number vs DraftKings. ${formatPoints(1.5)}+ lean, ${formatPoints(3)}+ hammer, ${formatPoints(4)}+ lock.`,
  },
  {
    factor: 'FG hook (3)',
    value: `±${FG_HOOK_POINTS.toFixed(2)}`,
    detail: 'Favorable side of 2.5 / 3.5 adds; the bad side subtracts.',
  },
  {
    factor: 'TD hook (7)',
    value: `±${TD_HOOK_POINTS.toFixed(2)}`,
    detail: 'Favorable side of 6.5 / 7.5 adds; the bad side subtracts.',
  },
  {
    factor: 'NFL first-team Out',
    value: `−${INJURY_TIER_POINTS.out.toFixed(2)} each`,
    detail: 'Charged to that team. Missing ESPN data is treated as zero.',
  },
  {
    factor: 'Doubtful / reserve / Q',
    value: `−${INJURY_TIER_POINTS.doubtful.toFixed(2)} / ${INJURY_TIER_POINTS.reserve.toFixed(2)} / ${INJURY_TIER_POINTS.questionable.toFixed(2)}`,
    detail: `Questionable is a whisper. Each team's total is capped at ${MAX_TEAM_INJURY_ADJUSTMENT.toFixed(2)}.`,
  },
  {
    factor: 'Rest',
    value: `±${REST_POINTS_PER_DAY.toFixed(2)} per day`,
    detail: `Off a seven-day baseline, capped at ${formatPoints(MAX_REST_ADJUSTMENT)}.`,
  },
  {
    factor: 'Travel',
    value: `−${TRAVEL_POINTS_PER_ZONE.toFixed(2)} per zone`,
    detail: `Crossed time zones, capped at ${formatPoints(MAX_TRAVEL_ADJUSTMENT)}.`,
  },
  {
    factor: 'Rest + travel cap',
    value: `±${MAX_CONTEXT_ADJUSTMENT.toFixed(2)}`,
    detail: 'Combined context can overturn only a thin line edge.',
  },
  {
    factor: 'Score',
    value: `${PCT_PER_SPREAD_POINT}% per point`,
    detail: 'Net edge converted to the win-rate score used inside a tier.',
  },
]

const HOOK_SOLID_FLOOR = 6

export function lineValueScore(
  category: EdgeCategory,
  edge: number,
  hook: HookKind | null = null,
) {
  let score = edge * PCT_PER_SPREAD_POINT
  if (category === 'lock') score = 15 + (edge - 4) * PCT_PER_SPREAD_POINT
  else if (category === 'hammer') score = 12 + (edge - 3) * PCT_PER_SPREAD_POINT
  else if (category === 'lean') score = 6 + (edge - 1.5) * 4
  if (hook && score < HOOK_SOLID_FLOOR) return HOOK_SOLID_FLOOR
  return score
}

export function lineValueStrength(
  category: EdgeCategory,
  hook: HookKind | null = null,
): PickStrength {
  if (category === 'lock' || category === 'hammer') return 'strong'
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
    const sourceRank: Record<CardPickSource, number> = {
      'line-value': 0,
      'rest-travel': 1,
      'public-consensus': 2,
      'season-results': 3,
      'pool-aware': 4,
    }
    return sourceRank[left.source] - sourceRank[right.source]
  }
  const strength = STRENGTH_RANK[right.strength] - STRENGTH_RANK[left.strength]
  if (strength) return strength
  if (right.score !== left.score) return right.score - left.score
  return left.kickoff.localeCompare(right.kickoff)
}

export type RecommendationOrderKey = {
  category: EdgeCategory
  edge: number | null
  hook: HookKind | null
  compositeEdge?: number
  publicSupport: PublicSupport
  publicPct: number | null
  kickoff: string
}

export function recommendationOrderKey(input: {
  category: EdgeCategory
  edge: number | null
  recommendedSide: 'home' | 'away' | null
  homeSpread: number
  liveHomeSpread?: number | null
  consensus: ConsensusGame | undefined
  travelRest?: GameTravelRest | null
  injuries?: {
    away?: NflStarterInjuryTeam | null
    home?: NflStarterInjuryTeam | null
  }
  kickoff: string
}): RecommendationOrderKey {
  const adjustment = recommendationAdjustment({
    ...input,
    homeSpread:
      input.liveHomeSpread == null ? undefined : input.homeSpread,
  })
  return {
    category: input.category,
    edge: input.edge,
    hook: favorableHookForSide(input.homeSpread, adjustment.pickedSide),
    compositeEdge: Math.abs(adjustment.total),
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
  const compositeEdge =
    (right.compositeEdge ?? right.edge ?? 0) -
    (left.compositeEdge ?? left.edge ?? 0)
  if (compositeEdge) return compositeEdge
  const edge = (right.edge ?? -1) - (left.edge ?? -1)
  if (edge) return edge
  const hook =
    HOOK_RANK[right.hook ?? 'none'] - HOOK_RANK[left.hook ?? 'none']
  if (hook) return hook
  return left.kickoff.localeCompare(right.kickoff)
}

export function resolveCardPick(input: {
  category: EdgeCategory
  recommendedSide: 'home' | 'away' | null
  edge: number | null
  homeSpread: number
  liveHomeSpread?: number | null
  consensus: ConsensusGame | undefined
  travelRest?: GameTravelRest | null
  injuries?: {
    away?: NflStarterInjuryTeam | null
    home?: NflStarterInjuryTeam | null
  }
}): ResolvedCardPick {
  const empty: ResolvedCardPick = {
    source: null,
    pickedSide: null,
    strength: null,
    score: null,
    compositeEdge: null,
    poolSpread: null,
    detail: null,
    skipReason: null,
    hook: null,
    publicSupport: 'none',
    publicPct: null,
  }

  const adjustment = recommendationAdjustment({
    ...input,
    homeSpread:
      input.liveHomeSpread == null ? undefined : input.homeSpread,
  })
  if (!adjustment.pickedSide) {
    const hasLine = adjustment.line !== 0
    const hasHook = adjustment.hook !== 0
    const hasInjury = adjustment.injury !== 0
    const hasContext = adjustment.context !== 0
    const skipReason =
      (hasLine || hasHook || hasInjury) && hasContext
        ? 'Modeled edge is exactly offset by rest and travel'
        : input.category === 'pending'
          ? 'No DraftKings line and no rest or travel advantage'
          : 'No line-value, hook, injury, rest, or travel advantage'
    return { ...empty, skipReason }
  }

  const pickedSide = adjustment.pickedSide
  const sideSign = pickedSide === 'home' ? 1 : -1
  const pickedHook = adjustment.hook * sideSign
  const hookKind = keyNumberHook(input.homeSpread)
  const hook = pickedHook > 0 ? hookKind : null
  const followsLine =
    (LINE_VALUE_CATEGORIES.has(input.category) &&
      input.recommendedSide === pickedSide) ||
    (pickedHook > 0 && Math.sign(adjustment.line + adjustment.hook) === sideSign)
  const source: CardPickSource = followsLine ? 'line-value' : 'rest-travel'
  const pickedRest = adjustment.rest * sideSign
  const pickedTravel = adjustment.travel * sideSign
  const pickedInjury = adjustment.injury * sideSign
  const parts: string[] = []
  if (input.edge != null && input.edge > 0) {
    parts.push(`${formatPoints(input.edge)}-point line value`)
  }
  if (hookKind && pickedHook !== 0) {
    parts.push(
      `${hookKind === 'fg' ? 'FG' : 'TD'} hook ${pickedHook > 0 ? '+' : ''}${formatPoints(pickedHook)}`,
    )
  }
  if (pickedInjury !== 0) {
    parts.push(
      `injuries ${pickedInjury > 0 ? '+' : ''}${formatPoints(pickedInjury)}`,
    )
  }
  if (pickedRest !== 0) {
    parts.push(`rest ${pickedRest > 0 ? '+' : ''}${formatPoints(pickedRest)}`)
  }
  if (pickedTravel !== 0) {
    parts.push(`travel ${pickedTravel > 0 ? '+' : ''}${formatPoints(pickedTravel)}`)
  }
  parts.push(`${formatPoints(Math.abs(adjustment.total))}-point net edge`)

  return {
    source,
    pickedSide,
    strength: followsLine
      ? lineValueStrength(input.category, hook)
      : 'mild',
    score: followsLine
      ? Math.max(
          hook ? HOOK_SOLID_FLOOR : 0,
          lineValueScore(input.category, input.edge ?? 0) +
            pickedHook * PCT_PER_SPREAD_POINT +
            pickedInjury * PCT_PER_SPREAD_POINT +
            adjustment.context * sideSign * PCT_PER_SPREAD_POINT,
        )
      : Math.abs(adjustment.total) * PCT_PER_SPREAD_POINT,
    compositeEdge: Math.abs(adjustment.total),
    poolSpread: poolSpreadForSide(input.homeSpread, pickedSide),
    detail: parts.join(' · '),
    skipReason: null,
    hook,
    publicSupport: publicSupportForSide(
      input.consensus,
      input.homeSpread,
      pickedSide,
    ),
    publicPct: publicPctForSort(
      input.consensus,
      input.homeSpread,
      pickedSide,
    ),
  }
}
