import type { ConsensusGame, GameAnalysis } from './types'

/** Bump this when the pick rules change so generated cards stay labeled. */
export const CARD_STRATEGY_ID = 'v1-line-then-public'

const LINE_VALUE_CATEGORIES = new Set(['hammer', 'lean', 'slight'])

export type SuggestedPick = {
  cbsEventId: number
  away: string
  home: string
  kickoffLabel: string
  pickedSide: 'home' | 'away'
  pickedTeam: string
  poolSpread: number
  source: 'line-value' | 'public-consensus'
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

function publicDetail(consensus: ConsensusGame, side: 'home' | 'away') {
  const leader = consensus[side]
  const coversLine =
    leader.spread == null ? '' : ` at Covers ${formatPoolSpread(leader.spread)}`
  return `${leader.pct}%${coversLine}`
}

/**
 * v1 card rules (swap this function when Performance data should weight tiers):
 * 1. Hammer / lean / slight → the line-value side.
 * 2. Otherwise, if Covers has a majority, take that public side (neutral or
 *    still awaiting a book line).
 * 3. No line-value pick and no Covers majority → leave unpicked and explain.
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
      picks.push({
        ...base,
        pickedSide: recommendedSide,
        pickedTeam: team.name,
        poolSpread: poolSpreadForSide(game.homeSpread, recommendedSide),
        source: 'line-value',
        detail: `${category} on the pool number`,
      })
      continue
    }

    const publicSide = publicConsensusSide(consensus)
    if (publicSide && consensus) {
      picks.push({
        ...base,
        pickedSide: publicSide,
        pickedTeam: game[publicSide].name,
        poolSpread: poolSpreadForSide(game.homeSpread, publicSide),
        source: 'public-consensus',
        detail: publicDetail(consensus, publicSide),
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
      `• ${pick.pickedTeam} ${formatPoolSpread(pick.poolSpread)}  (${pick.away} @ ${pick.home}) — ${pick.detail}`,
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
