import {
  CARD_STRATEGY_NOTE,
  compareRecommendationOrder,
  formatPoolSpread,
  resolveCardPick,
  type PickStrength,
  type PublicSupport,
} from './cardScoring'
import type { EdgeCategory, GameAnalysis, SlateTiebreaker } from './types'

export {
  CARD_STRATEGY_NOTE,
  formatPoolSpread,
  PCT_PER_SPREAD_POINT,
  type PickStrength,
} from './cardScoring'

/** Bump this when the pick rules change so generated cards stay labeled. */
export const CARD_STRATEGY_ID = 'v5-line-then-public-modifier'

export type SuggestedPick = {
  gameId: string
  cbsEventId: number
  away: string
  awayId: string
  home: string
  homeId: string
  kickoff: string
  kickoffLabel: string
  pickedSide: 'home' | 'away'
  pickedTeamId: string
  pickedTeam: string
  poolSpread: number
  source: 'line-value' | 'public-consensus'
  /** Visible Lines band; Recommendation sort uses this, not the strength badge. */
  category: EdgeCategory
  edge: number | null
  strength: PickStrength
  hook: 'fg' | 'td' | null
  publicSupport: PublicSupport
  /** Near-pool bucket % on the picked side. Used to order inside a band. */
  publicPct: number | null
  /** Comparable rank used to sort the modal. Higher is a stronger pick. */
  score: number
  detail: string
}

export type UnpickedGame = {
  gameId: string
  cbsEventId: number
  away: string
  home: string
  kickoffLabel: string
  reason: string
}

export type SuggestedCard = {
  strategyId: string
  generatedAt: string
  seasonYear: number
  week: number
  weekLabel: string
  picks: SuggestedPick[]
  unpicked: UnpickedGame[]
  tiebreaker: SuggestedTiebreaker | null
}

export type SuggestedTiebreaker = {
  questionId: string
  gameId: string
  question: string
  away: string
  home: string
  draftKingsTotal: number | null
  totalRetrievedAt: string | null
}

/**
 * v5 card rules:
 * 1. Lock / hammer / lean / slight → the line-value side. Public never outranks
 *    these, even a mild slight vs a strong Covers majority.
 * 2. A favorable FG (2.5/3.5) or TD (6.5/7.5) hook is still that line-value
 *    pick and badges as solid. Recommendation sort keeps it in its point
 *    band, matching the Lines page.
 * 3. Inside a line-value band, same edge: a favorable TD hook ranks
 *    above an FG hook, and either ranks above no hook. Then the higher
 *    near-pool public % on the picked side ranks first. Fade sinks.
 * 4. Otherwise, use a meaningful Covers Picks Per Line bucket within one
 *    point of the pool line. Those leftover fills always sit below slights.
 * 5. No line-value pick and no qualifying Covers majority → leave unpicked.
 */
export function generateSuggestedCard(
  analyses: GameAnalysis[],
  weekLabel: string,
  seasonYear: number,
  tiebreaker: SlateTiebreaker | null | undefined,
  generatedAt = new Date(),
): SuggestedCard {
  const picks: SuggestedPick[] = []
  const unpicked: UnpickedGame[] = []

  for (const analysis of analyses) {
    const { game, category, recommendedSide, consensus } = analysis
    const base = {
      gameId: game.id,
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
      liveHomeSpread: analysis.liveHomeSpread,
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
        awayId: game.away.id,
        homeId: game.home.id,
        pickedSide: cardPick.pickedSide,
        pickedTeamId: game[cardPick.pickedSide].id,
        pickedTeam: game[cardPick.pickedSide].name,
        poolSpread: cardPick.poolSpread,
        source: cardPick.source,
        category,
        edge: analysis.edge,
        strength: cardPick.strength,
        hook: cardPick.hook,
        publicSupport: cardPick.publicSupport,
        publicPct: cardPick.publicPct,
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

  const tiebreakerAnalysis = tiebreaker
    ? analyses.find((analysis) => analysis.game.id === tiebreaker.gameId)
    : undefined
  const draftKingsTotal =
    tiebreakerAnalysis?.odds?.totals?.draftkings ?? null

  return {
    strategyId: CARD_STRATEGY_ID,
    generatedAt: generatedAt.toISOString(),
    seasonYear,
    week: analyses[0]?.game.week ?? 0,
    weekLabel,
    picks,
    unpicked,
    tiebreaker:
      tiebreaker && tiebreakerAnalysis
        ? {
            questionId: tiebreaker.questionId,
            gameId: tiebreaker.gameId,
            question: tiebreaker.question,
            away: tiebreakerAnalysis.game.away.name,
            home: tiebreakerAnalysis.game.home.name,
            draftKingsTotal: draftKingsTotal?.line ?? null,
            totalRetrievedAt: draftKingsTotal?.retrievedAt ?? null,
          }
        : null,
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

export function oppositeSide(side: 'home' | 'away') {
  return side === 'home' ? 'away' : 'home'
}

export function submittedPick(pick: SuggestedPick, deviate: boolean) {
  const side = deviate ? oppositeSide(pick.pickedSide) : pick.pickedSide
  return {
    pickedSide: side,
    pickedTeamId: side === 'home' ? pick.homeId : pick.awayId,
    pickedTeam: side === 'home' ? pick.home : pick.away,
    poolSpread: deviate ? -pick.poolSpread : pick.poolSpread,
  }
}

export function sortSuggestedPicks(
  picks: SuggestedPick[],
  sort: 'slate' | 'recommendation',
) {
  if (sort === 'slate') return picks
  return [...picks].sort((left, right) =>
    compareRecommendationOrder(
      {
        category: left.category,
        edge: left.edge,
        hook: left.hook,
        publicSupport: left.publicSupport,
        publicPct: left.publicPct,
        kickoff: left.kickoff,
      },
      {
        category: right.category,
        edge: right.edge,
        hook: right.hook,
        publicSupport: right.publicSupport,
        publicPct: right.publicPct,
        kickoff: right.kickoff,
      },
    ),
  )
}

export function formatSuggestedCardText(
  card: SuggestedCard,
  picks: SuggestedPick[] = card.picks,
  deviations: ReadonlySet<string> = new Set(),
  tiebreakerAnswer: number | null = null,
) {
  const when = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(card.generatedAt))

  const pickLines = picks.map((pick) => {
    const deviate = deviations.has(pick.gameId)
    const sent = submittedPick(pick, deviate)
    const rec = `${pick.pickedTeam} ${formatPoolSpread(pick.poolSpread)}`
    const choice = `${sent.pickedTeam} ${formatPoolSpread(sent.poolSpread)}`
    return `• ${choice}  (${pick.away} @ ${pick.home}) — ${pick.strength} ${pick.source === 'line-value' ? 'line value' : 'public'}${pick.hook ? ` · ${pick.hook === 'fg' ? 'FG' : 'TD'} hook` : ''}${pick.source === 'line-value' && pick.publicSupport !== 'none' ? ` · public ${pick.publicSupport === 'agree' ? 'agrees' : 'fades'}` : ''}${deviate ? ` · deviate from ${rec}` : ''} · ${pick.detail}`
  })
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
    ...(card.tiebreaker
      ? [
          '',
          `Tiebreaker: ${card.tiebreaker.away} @ ${card.tiebreaker.home} — ${
            tiebreakerAnswer ?? 'blank'
          }${
            card.tiebreaker.draftKingsTotal != null
              ? ` (DraftKings O/U ${card.tiebreaker.draftKingsTotal})`
              : ''
          }`,
        ]
      : []),
  ].join('\n')
}
