import type { ConsensusGame, EdgeCategory, GameAnalysis } from './types'

/** Bump this when the pick rules change so generated cards stay labeled. */
export const CARD_STRATEGY_ID = 'v2-line-then-public-spread-gap'

/** Extra public percentage required per point the pool number is worse than Covers. */
export const PCT_PER_SPREAD_POINT = 3

const LINE_VALUE_CATEGORIES = new Set<EdgeCategory>(['hammer', 'lean', 'slight'])

export type PickStrength = 'mild' | 'solid' | 'strong'

export type SuggestedPick = {
  cbsEventId: number
  away: string
  home: string
  kickoffLabel: string
  pickedSide: 'home' | 'away'
  pickedTeam: string
  poolSpread: number
  source: 'line-value' | 'public-consensus'
  strength: PickStrength
  detail: string
}

export type UnpickedGame = {
  cbsEventId: number
  away: string
  home: string
  kickoffLabel: string
  reason: string
}

export type SuggestedCard = {
  strategyId: string
  generatedAt: string
  weekLabel: string
  picks: SuggestedPick[]
  unpicked: UnpickedGame[]
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatPoolSpread(value: number) {
  if (value === 0) return 'PK'
  const points = formatPoints(Math.abs(value))
  return value > 0 ? `+${points}` : `-${points}`
}

function poolSpreadForSide(homeSpread: number, side: 'home' | 'away') {
  return homeSpread * (side === 'away' ? -1 : 1)
}

function publicConsensusSide(consensus: ConsensusGame | undefined) {
  if (!consensus || consensus.matchStatus !== 'matched') return null
  const { away, home } = consensus
  if (away.pct == null || home.pct == null) return null
  if (away.pct === home.pct) return null
  return home.pct > away.pct ? ('home' as const) : ('away' as const)
}

function lineValueStrength(category: EdgeCategory): PickStrength {
  if (category === 'hammer') return 'strong'
  if (category === 'lean') return 'solid'
  return 'mild'
}

function classifyPublicScore(score: number): PickStrength {
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

/**
 * Positive gap = the pool number is more generous to this side than Covers.
 * Score = (public% - 50) + 3 × gap. At or below 0, skip the public pick.
 */
function evaluatePublicPick(
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
    detail,
    poolSpread,
  }
}

/**
 * v2 card rules (swap this function when Performance data should weight tiers):
 * 1. Hammer / lean / slight → the line-value side.
 * 2. Otherwise, if Covers has a majority that still clears a 3%-per-point
 *    penalty when the pool number is worse than Covers, take that public side.
 * 3. No line-value pick and no qualifying Covers majority → leave unpicked.
 */
export function generateSuggestedCard(
  analyses: GameAnalysis[],
  weekLabel: string,
  generatedAt = new Date(),
): SuggestedCard {
  const picks: SuggestedPick[] = []
  const unpicked: UnpickedGame[] = []

  for (const analysis of analyses) {
    const { game, category, recommendedSide, consensus } = analysis
    const base = {
      cbsEventId: game.cbsEventId,
      away: game.away.name,
      home: game.home.name,
      kickoffLabel: game.kickoffLabel.replace(' ET', ''),
    }

    if (LINE_VALUE_CATEGORIES.has(category) && recommendedSide) {
      const team = game[recommendedSide]
      const edgeLabel =
        analysis.edge == null
          ? `${category} on the pool number`
          : `${formatPoints(analysis.edge)}-point ${category} on the pool number`
      picks.push({
        ...base,
        pickedSide: recommendedSide,
        pickedTeam: team.name,
        poolSpread: poolSpreadForSide(game.homeSpread, recommendedSide),
        source: 'line-value',
        strength: lineValueStrength(category),
        detail: edgeLabel,
      })
      continue
    }

    const publicSide = publicConsensusSide(consensus)
    if (publicSide && consensus) {
      const publicPick = evaluatePublicPick(
        consensus,
        publicSide,
        game.homeSpread,
      )
      if (publicPick.ok) {
        picks.push({
          ...base,
          pickedSide: publicSide,
          pickedTeam: game[publicSide].name,
          poolSpread: publicPick.poolSpread,
          source: 'public-consensus',
          strength: publicPick.strength,
          detail: publicPick.detail,
        })
        continue
      }

      unpicked.push({
        ...base,
        reason: publicPick.reason,
      })
      continue
    }

    unpicked.push({
      ...base,
      reason: unpickedReason(analysis),
    })
  }

  return {
    strategyId: CARD_STRATEGY_ID,
    generatedAt: generatedAt.toISOString(),
    weekLabel,
    picks,
    unpicked,
  }
}

function unpickedReason(analysis: GameAnalysis) {
  const { category, consensus } = analysis
  if (consensus?.matchStatus === 'matched') {
    if (consensus.away.pct != null && consensus.away.pct === consensus.home.pct) {
      return 'No line-value edge; Covers public is split'
    }
  }
  if (category === 'pending') {
    return 'No DraftKings line and no Covers consensus yet'
  }
  if (category === 'neutral') {
    return 'Lines match and no Covers consensus yet'
  }
  return 'No line-value pick and no Covers consensus yet'
}

export function formatSuggestedCardText(card: SuggestedCard) {
  const when = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(card.generatedAt))

  const pickLines = card.picks.map(
    (pick) =>
      `• ${pick.pickedTeam} ${formatPoolSpread(pick.poolSpread)}  (${pick.away} @ ${pick.home}) — ${pick.strength} ${pick.source === 'line-value' ? 'line value' : 'public'} · ${pick.detail}`,
  )
  const skipLines = card.unpicked.map(
    (game) => `• ${game.away} @ ${game.home} — ${game.reason}`,
  )

  return [
    `${card.weekLabel} suggested card`,
    `Generated ${when} · ${card.strategyId}`,
    '',
    `Picks (${card.picks.length})`,
    ...(pickLines.length ? pickLines : ['• none']),
    '',
    `Left unpicked (${card.unpicked.length})`,
    ...(skipLines.length ? skipLines : ['• none']),
  ].join('\n')
}
