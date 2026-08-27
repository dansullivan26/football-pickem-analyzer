import {
  CARD_STRATEGY_NOTE,
  formatPoolSpread,
  resolveCardPick,
  type PickStrength,
} from './cardScoring'
import type { GameAnalysis } from './types'

export {
  CARD_STRATEGY_NOTE,
  formatPoolSpread,
  PCT_PER_SPREAD_POINT,
  type PickStrength,
} from './cardScoring'

/** Bump this when the pick rules change so generated cards stay labeled. */
export const CARD_STRATEGY_ID = 'v2-line-then-public-spread-gap'

export type SuggestedPick = {
  cbsEventId: number
  away: string
  home: string
  kickoff: string
  kickoffLabel: string
  pickedSide: 'home' | 'away'
  pickedTeam: string
  poolSpread: number
  source: 'line-value' | 'public-consensus'
  strength: PickStrength
  /** Comparable rank used to sort the modal. Higher is a stronger pick. */
  score: number
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
      kickoff: game.kickoff,
      kickoffLabel: game.kickoffLabel.replace(' ET', ''),
    }

    const cardPick = resolveCardPick({
      category,
      recommendedSide,
      edge: analysis.edge,
      homeSpread: game.homeSpread,
      consensus,
    })

    if (
      cardPick.source &&
      cardPick.pickedSide &&
      cardPick.strength != null &&
      cardPick.score != null &&
      cardPick.poolSpread != null &&
      cardPick.detail
    ) {
      picks.push({
        ...base,
        pickedSide: cardPick.pickedSide,
        pickedTeam: game[cardPick.pickedSide].name,
        poolSpread: cardPick.poolSpread,
        source: cardPick.source,
        strength: cardPick.strength,
        score: cardPick.score,
        detail: cardPick.detail,
      })
      continue
    }

    unpicked.push({
      ...base,
      reason: cardPick.skipReason ?? unpickedReason(analysis),
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

export function sortSuggestedPicks(
  picks: SuggestedPick[],
  sort: 'slate' | 'strength',
) {
  if (sort === 'slate') return picks
  return [...picks].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return left.kickoff.localeCompare(right.kickoff)
  })
}

export function formatSuggestedCardText(
  card: SuggestedCard,
  picks: SuggestedPick[] = card.picks,
) {
  const when = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(card.generatedAt))

  const pickLines = picks.map(
    (pick) =>
      `• ${pick.pickedTeam} ${formatPoolSpread(pick.poolSpread)}  (${pick.away} @ ${pick.home}) — ${pick.strength} ${pick.source === 'line-value' ? 'line value' : 'public'} · ${pick.detail}`,
  )
  const skipLines = card.unpicked.map(
    (game) => `• ${game.away} @ ${game.home} — ${game.reason}`,
  )

  return [
    `${card.weekLabel} suggested card`,
    `Generated ${when} · ${card.strategyId}`,
    CARD_STRATEGY_NOTE,
    '',
    `Picks (${picks.length})`,
    ...(pickLines.length ? pickLines : ['• none']),
    '',
    `Left unpicked (${card.unpicked.length})`,
    ...(skipLines.length ? skipLines : ['• none']),
  ].join('\n')
}
