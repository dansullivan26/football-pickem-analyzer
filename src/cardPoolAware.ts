import {
  generateSuggestedCard,
  type SuggestedCard,
  type SuggestedPick,
  type UnpickedGame,
} from './cardStrategy.ts'
import {
  frozenPlayerWeek,
  predictPlayerWeek,
  type PredictionForecasts,
} from './playerPrediction.ts'
import type { AppearanceTravelRest, GameTravelRest } from './travelRest.ts'
import type { NflStarterInjuryTeam } from './nflStarterInjuries.ts'
import type {
  GameAnalysis,
  PlayerHistory,
  RecommendationHistory,
  SlateTiebreaker,
} from './types.ts'

export const POOL_AWARE_STRATEGY_ID = 'v1-pool-aware'

export const POOL_AWARE_STRATEGY_NOTE =
  'Pool-aware card. Locks, hammers, and leans stay with the ATS algorithm. On games with no ATS edge, it fades the side our leak-free player reads expect the pool to take — only when enough players have a call. Unknowns stay visible. This is contest leverage, not a claim the faded side is more likely to cover.'

export type PoolProjection = {
  home: number
  away: number
  unknown: number
  called: number
}

const MIN_CALLED = 8
const MAJORITY = 0.625

export function projectPoolForGame(
  predictedSides: Array<'home' | 'away' | null | undefined>,
): PoolProjection {
  let home = 0
  let away = 0
  let unknown = 0
  for (const side of predictedSides) {
    if (side === 'home') home += 1
    else if (side === 'away') away += 1
    else unknown += 1
  }
  return { home, away, unknown, called: home + away }
}

export function poolProjectionCopy(projection: PoolProjection) {
  if (projection.called === 0) {
    return `No leak-free player calls (${projection.unknown} unknown)`
  }
  const leader = projection.home >= projection.away ? 'home' : 'away'
  const count = leader === 'home' ? projection.home : projection.away
  const pct = Math.round((count / projection.called) * 100)
  return `Projected pool among ${projection.called} calls: ${pct}% ${leader} (${projection.home} home / ${projection.away} away, ${projection.unknown} unknown)`
}

export function playerPredictedSidesForWeek(
  cbsEventId: number,
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  forecasts: PredictionForecasts | null | undefined,
  week: number,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
) {
  const recWeek = recommendations.weeks.find((row) => row.week === week)
  if (!recWeek) {
    return history.entries.map(() => null)
  }
  return history.entries.map((entry) => {
    const frozen = frozenPlayerWeek(forecasts, entry.entryId, week)
    const game =
      frozen?.games.find((row) => row.cbsEventId === cbsEventId) ??
      predictPlayerWeek(
        entry.entryId,
        recWeek,
        history,
        recommendations,
        travelRestByAppearance,
      ).games.find((row) => row.cbsEventId === cbsEventId)
    return game?.predictedSide ?? null
  })
}

function leverageSide(projection: PoolProjection): 'home' | 'away' | null {
  if (projection.called < MIN_CALLED) return null
  const homeShare = projection.home / projection.called
  const awayShare = projection.away / projection.called
  if (homeShare >= MAJORITY) return 'away'
  if (awayShare >= MAJORITY) return 'home'
  return null
}

function keepAtsPick(pick: SuggestedPick) {
  return (
    pick.category === 'lock' ||
    pick.category === 'hammer' ||
    pick.category === 'lean' ||
    (pick.compositeEdge != null && pick.compositeEdge >= 1.5)
  )
}

export function generatePoolAwareCard(
  analyses: GameAnalysis[],
  week: { order: number; label: string },
  seasonYear: number,
  tiebreaker: SlateTiebreaker | null | undefined,
  projections: Map<number, PoolProjection>,
  generatedAt = new Date(),
  travelRestByEvent: ReadonlyMap<number, GameTravelRest> = new Map(),
  injuriesByAbbrev: ReadonlyMap<string, NflStarterInjuryTeam> = new Map(),
): SuggestedCard {
  const ats = generateSuggestedCard(
    analyses,
    week,
    seasonYear,
    tiebreaker,
    generatedAt,
    travelRestByEvent,
    injuriesByAbbrev,
  )
  const picks: SuggestedPick[] = []
  const unpicked: UnpickedGame[] = []
  const atsById = new Map(ats.picks.map((pick) => [pick.gameId, pick]))
  const leftover = new Map(ats.unpicked.map((row) => [row.gameId, row]))

  for (const analysis of analyses) {
    const { game } = analysis
    const projection =
      projections.get(game.cbsEventId) ??
      projectPoolForGame([])
    const poolCopy = poolProjectionCopy(projection)
    const atsPick = atsById.get(game.id)

    if (atsPick && keepAtsPick(atsPick)) {
      picks.push({
        ...atsPick,
        detail: `${atsPick.detail} · ${poolCopy}`,
      })
      continue
    }

    if (atsPick && !keepAtsPick(atsPick)) {
      picks.push({
        ...atsPick,
        detail: `${atsPick.detail} · ${poolCopy}`,
      })
      leftover.delete(game.id)
      continue
    }

    const fade = leverageSide(projection)
    if (!fade) {
      const base = leftover.get(game.id)
      unpicked.push({
        ...(base ?? {
          gameId: game.id,
          cbsEventId: game.cbsEventId,
          away: game.away.name,
          awayId: game.away.id,
          home: game.home.name,
          homeId: game.home.id,
          homeSpread: game.homeSpread,
          kickoff: game.kickoff,
          kickoffLabel: game.kickoffLabel.replace(' ET', ''),
          reason: '',
        }),
        reason: base
          ? `${base.reason}. ${poolCopy}`
          : `No ATS edge and no clear pool majority. ${poolCopy}`,
      })
      continue
    }

    const poolSpread =
      fade === 'home' ? game.homeSpread : game.homeSpread * -1
    picks.push({
      gameId: game.id,
      cbsEventId: game.cbsEventId,
      away: game.away.name,
      awayId: game.away.id,
      home: game.home.name,
      homeId: game.home.id,
      kickoff: game.kickoff,
      kickoffLabel: game.kickoffLabel.replace(' ET', ''),
      pickedSide: fade,
      pickedTeamId: game[fade].id,
      pickedTeam: game[fade].name,
      poolSpread,
      source: 'pool-aware',
      category: 'slight',
      edge: analysis.edge,
      strength: 'mild',
      hook: null,
      publicSupport: 'none',
      publicPct: null,
      score: 0.5,
      compositeEdge: 0,
      detail: `Leverage fade of expected pool chalk. ${poolCopy}`,
    })
  }

  return {
    ...ats,
    strategyId: POOL_AWARE_STRATEGY_ID,
    title: 'Pool-aware card',
    strategyNote: POOL_AWARE_STRATEGY_NOTE,
    picks,
    unpicked,
  }
}
