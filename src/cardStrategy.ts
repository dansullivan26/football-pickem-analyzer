import {
  CARD_STRATEGY_NOTE,
  compareRecommendationOrder,
  formatPoolSpread,
  resolveCardPick,
  type CardPickSource,
  type PickStrength,
  type PublicSupport,
} from './cardScoring'
import type { GameTravelRest } from './travelRest'
import type { EdgeCategory, GameAnalysis, SlateTiebreaker } from './types'

export {
  CARD_STRATEGY_NOTE,
  formatPoolSpread,
  PCT_PER_SPREAD_POINT,
  type PickStrength,
} from './cardScoring'

/** Bump this when the pick rules change so generated cards stay labeled. */
export const CARD_STRATEGY_ID = 'v6-line-rest-travel'

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
  source: CardPickSource
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
  /** Net edge in spread-point equivalents after rest and travel. */
  compositeEdge: number
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
 * v6 card rules:
 * 1. Start with the signed line-value edge.
 * 2. Add capped rest and travel adjustments (at most one point combined).
 * 3. Covers remains informational and never selects or sorts a pick.
 * 4. A zero composite edge stays unpicked.
 */
export function generateSuggestedCard(
  analyses: GameAnalysis[],
  weekLabel: string,
  seasonYear: number,
  tiebreaker: SlateTiebreaker | null | undefined,
  generatedAt = new Date(),
  travelRestByEvent: ReadonlyMap<number, GameTravelRest> = new Map(),
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
      travelRest: travelRestByEvent.get(game.cbsEventId),
    })

    if (
      cardPick.source &&
      cardPick.pickedSide &&
      cardPick.strength != null &&
      cardPick.score != null &&
      cardPick.compositeEdge != null &&
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
        compositeEdge: cardPick.compositeEdge,
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
  const { category } = analysis
  if (category === 'pending') {
    return 'No DraftKings line and no rest or travel advantage'
  }
  return 'No line-value, rest, or travel advantage'
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
        compositeEdge: left.compositeEdge,
        publicSupport: left.publicSupport,
        publicPct: left.publicPct,
        kickoff: left.kickoff,
      },
      {
        category: right.category,
        edge: right.edge,
        hook: right.hook,
        compositeEdge: right.compositeEdge,
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
    const source =
      pick.source === 'line-value'
        ? 'line value'
        : pick.source === 'rest-travel'
          ? 'rest/travel'
          : 'public'
    return `• ${choice}  (${pick.away} @ ${pick.home}) — ${pick.strength} ${source}${pick.hook ? ` · ${pick.hook === 'fg' ? 'FG' : 'TD'} hook` : ''}${pick.publicSupport !== 'none' ? ` · public ${pick.publicSupport === 'agree' ? 'agrees' : 'fades'}` : ''}${deviate ? ` · deviate from ${rec}` : ''} · ${pick.detail}`
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
