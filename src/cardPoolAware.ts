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
import {
  formatPoolRecordDetail,
  formatPoolRecordLabel,
  poolRecordIsGraded,
  type PoolGameRecord,
  type PoolSideSplit,
} from './poolRecord.ts'
import type {
  GameAnalysis,
  PlayerHistory,
  RecommendationHistory,
  SlateTiebreaker,
} from './types.ts'
import { ourRosterEntry } from './ourEntry.ts'

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

export type PoolExpectationView = {
  line: string
  detail: string
  title: string
  none: boolean
  side: 'home' | 'away' | null
  pct: number | null
}

/**
 * Row-card copy for the leak-free pool forecast. Percent is among players
 * with a call, not the whole field — unknowns stay visible in the detail.
 */
export function poolExpectationView(
  projection: PoolProjection | null | undefined,
  homeName: string,
  awayName: string,
): PoolExpectationView | null {
  if (!projection) return null

  if (projection.called === 0) {
    return {
      line: 'No calls yet',
      detail: projection.unknown
        ? `${projection.unknown} players unknown`
        : 'No modeled sides',
      title:
        'The leak-free prediction model has not named a side for any player on this game. Unknowns are players with no responsible call.',
      none: true,
      side: null,
      pct: null,
    }
  }

  if (projection.home === projection.away) {
    return {
      line: 'Pool looks split',
      detail: `${projection.home} home / ${projection.away} away${
        projection.unknown ? ` · ${projection.unknown} unknown` : ''
      }`,
      title: `Based on our prediction model, called players are split ${projection.home}–${projection.away} on this game.${
        projection.unknown
          ? ` ${projection.unknown} players have no responsible call.`
          : ''
      } This is expected contest share, not a cover claim.`,
      none: false,
      side: null,
      pct: 50,
    }
  }

  const side = projection.home > projection.away ? 'home' : 'away'
  const team = side === 'home' ? homeName : awayName
  const count = side === 'home' ? projection.home : projection.away
  const pct = Math.round((count / projection.called) * 100)
  return {
    line: `${team} ${pct}%`,
    detail: `${count} of ${projection.called} calls${
      projection.unknown ? ` · ${projection.unknown} unknown` : ''
    }`,
    title: `Based on our prediction model we expect ${pct}% of the pool to take ${team} (${count} of ${projection.called} players with a call${
      projection.unknown ? `; ${projection.unknown} unknown` : ''
    }). This is expected contest share, not a cover claim.`,
    none: false,
    side,
    pct,
  }
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part)).join(' · ')
}

function joinSentences(parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) =>
      /[.!?]$/.test(part) ? part : `${part.replace(/[.;]$/, '')}.`,
    )
    .join(' ')
}

/**
 * Submitted-card share after GrokBot ingest. Percent is among actual picks,
 * not modeled calls. The old Pool W–L–P book rides in the detail.
 */
export function actualPoolView(
  split: PoolSideSplit | null | undefined,
  record: PoolGameRecord | null | undefined,
  homeName: string,
  awayName: string,
  expected: Pick<PoolExpectationView, 'line' | 'side' | 'pct' | 'none'> | null = null,
): PoolExpectationView | null {
  if (!split) return null
  const graded = poolRecordIsGraded(record)
  if (split.picked === 0 && !graded) return null

  const ats = graded ? formatPoolRecordLabel(record) : null
  const atsDetail = graded ? formatPoolRecordDetail(record) : null
  const unpicked =
    split.unpicked > 0 ? `${split.unpicked} unpicked` : null
  const expectedNote =
    expected && !expected.none
      ? `Forecast was ${expected.line}.`
      : expected?.none
        ? 'The model had no responsible calls to compare.'
        : null

  if (split.picked === 0) {
    return {
      line: ats ?? 'No picks yet',
      detail: joinParts([unpicked]),
      title: joinSentences([
        'GrokBot has graded this game but no submitted sides were stored.',
        atsDetail,
        expectedNote,
      ]),
      none: true,
      side: null,
      pct: null,
    }
  }

  if (split.home === split.away) {
    return {
      line: 'Pool was split',
      detail: joinParts([
        `${split.home} home / ${split.away} away`,
        unpicked,
        ats,
      ]),
      title: joinSentences([
        `After results, submitted cards were split ${split.home}–${split.away}.`,
        atsDetail,
        expectedNote,
      ]),
      none: false,
      side: null,
      pct: 50,
    }
  }

  const side = split.home > split.away ? 'home' : 'away'
  const team = side === 'home' ? homeName : awayName
  const count = side === 'home' ? split.home : split.away
  const pct = Math.round((count / split.picked) * 100)
  const sameSide = expected?.side != null && expected.side === side
  const compare =
    expected?.pct != null && !expected.none
      ? sameSide
        ? `Forecast was ${expected.line}.`
        : `Forecast leaned the other way (${expected.line}).`
      : expectedNote

  return {
    line: `${team} ${pct}%`,
    detail: joinParts([
      `${count} of ${split.picked} picks`,
      unpicked,
      ats,
    ]),
    title: joinSentences([
      `After results, ${pct}% of submitted picks took ${team} (${count} of ${split.picked}${
        split.unpicked ? `; ${split.unpicked} unpicked` : ''
      }).`,
      atsDetail,
      compare,
    ]),
    none: false,
    side,
    pct,
  }
}

export function playerPredictedSidesForWeek(
  cbsEventId: number,
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  forecasts: PredictionForecasts | null | undefined,
  week: number,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
) {
  return (
    playerPredictedSidesByEvent(
      history,
      recommendations,
      forecasts,
      week,
      travelRestByAppearance,
    ).get(cbsEventId) ?? history.entries.map(() => null)
  )
}

function playerPredictedSidesByEvent(
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  forecasts: PredictionForecasts | null | undefined,
  week: number,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
  excludeEntryId?: string | null,
) {
  const recWeek = recommendations.weeks.find((row) => row.week === week)
  const sidesByEvent = new Map<number, Array<'home' | 'away' | null>>()
  if (!recWeek) return sidesByEvent

  for (const game of recWeek.games) {
    sidesByEvent.set(game.cbsEventId, [])
  }

  for (const entry of history.entries) {
    if (excludeEntryId && entry.entryId === excludeEntryId) continue
    const frozen = frozenPlayerWeek(forecasts, entry.entryId, week)
    const games =
      frozen?.games ??
      predictPlayerWeek(
        entry.entryId,
        recWeek,
        history,
        recommendations,
        travelRestByAppearance,
      ).games
    const byEvent = new Map(
      games.map((game) => [game.cbsEventId, game.predictedSide ?? null]),
    )
    for (const [eventId, sides] of sidesByEvent) {
      sides.push(byEvent.get(eventId) ?? null)
    }
  }

  return sidesByEvent
}

export function poolProjectionsForWeek(
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  forecasts: PredictionForecasts | null | undefined,
  week: number,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
  excludeEntryId?: string | null,
) {
  const sidesByEvent = playerPredictedSidesByEvent(
    history,
    recommendations,
    forecasts,
    week,
    travelRestByAppearance,
    excludeEntryId,
  )
  return new Map(
    [...sidesByEvent].map(([eventId, sides]) => [
      eventId,
      projectPoolForGame(sides),
    ]),
  )
}

/** Badge field: current roster minus Dan Sullivan, when we can identify the card. */
export function poolSupportProjectionsForWeek(
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  forecasts: PredictionForecasts | null | undefined,
  week: number,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
) {
  return poolProjectionsForWeek(
    history,
    recommendations,
    forecasts,
    week,
    travelRestByAppearance,
    ourRosterEntry(history)?.entryId ?? null,
  )
}

export type PoolSupportStance = 'agree' | 'take'
export type PoolSupportTier = 'majority' | 'strong' | 'heavy'

export type PoolSupportView = {
  stance: PoolSupportStance
  tier: PoolSupportTier
  pct: number
  side: 'home' | 'away'
  otherAbbrev: string | null
  line: string
  title: string
}

type PoolMajority = {
  side: 'home' | 'away'
  share: number
  count: number
  field: number
}

function leadingShare(
  projection: PoolProjection,
  field: number,
): PoolMajority | null {
  if (field < MIN_CALLED) return null
  const homeShare = projection.home / field
  const awayShare = projection.away / field
  if (homeShare >= MAJORITY) {
    return { side: 'home', share: homeShare, count: projection.home, field }
  }
  if (awayShare >= MAJORITY) {
    return { side: 'away', share: awayShare, count: projection.away, field }
  }
  return null
}

function calledMajority(projection: PoolProjection): PoolMajority | null {
  return leadingShare(projection, projection.called)
}

function fieldMajority(projection: PoolProjection): PoolMajority | null {
  return leadingShare(projection, projection.called + projection.unknown)
}

function poolSupportTier(share: number): PoolSupportTier {
  if (share >= 0.85) return 'heavy'
  if (share >= 0.75) return 'strong'
  return 'majority'
}

function poolSupportTierLabel(tier: PoolSupportTier) {
  if (tier === 'heavy') return 'Heavy majority'
  if (tier === 'strong') return 'Strong majority'
  return 'Majority'
}

/**
 * How the leak-free pool forecast sits versus a pick we already like.
 * Percent is of the field we have to beat — called and unknown, with
 * Dan Sullivan left out of the projection — not of responsible calls
 * only. Same 62.5% majority bar. Not a cover claim or a scoring input.
 */
export function poolSupportView(
  projection: PoolProjection | null | undefined,
  pickedSide: 'home' | 'away' | null | undefined,
  homeAbbrev: string,
  awayAbbrev: string,
): PoolSupportView | null {
  if (!projection || !pickedSide) return null
  const majority = fieldMajority(projection)
  if (!majority) return null

  const pct = Math.round((majority.count / majority.field) * 100)
  const tier = poolSupportTier(majority.share)
  const tierLabel = poolSupportTierLabel(tier)
  const stance: PoolSupportStance =
    majority.side === pickedSide ? 'agree' : 'take'
  const chalkAbbrev = majority.side === 'home' ? homeAbbrev : awayAbbrev
  const unknown =
    projection.unknown > 0
      ? ` ${projection.unknown} have no responsible call and count against the majority.`
      : ''
  const line =
    stance === 'agree'
      ? `${tierLabel} of pool expected to agree · ${pct}%`
      : `${tierLabel} of pool expected to take ${chalkAbbrev} · ${pct}%`
  const title =
    stance === 'agree'
      ? `Leak-free reads expect ${majority.count} of ${majority.field} other players to take the same side we like (${pct}%).${unknown} Your card is left out. This is expected contest share, not a cover claim.`
      : `Leak-free reads expect ${majority.count} of ${majority.field} other players to take ${chalkAbbrev} (${pct}%).${unknown} Your card is left out. This is expected contest share, not a cover claim.`

  return {
    stance,
    tier,
    pct,
    side: majority.side,
    otherAbbrev: stance === 'take' ? chalkAbbrev : null,
    line,
    title,
  }
}

function leverageSide(projection: PoolProjection): 'home' | 'away' | null {
  const majority = calledMajority(projection)
  if (!majority) return null
  return majority.side === 'home' ? 'away' : 'home'
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
          awayAbbrev: game.away.abbrev,
          awayId: game.away.id,
          home: game.home.name,
          homeAbbrev: game.home.abbrev,
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
      awayAbbrev: game.away.abbrev,
      awayId: game.away.id,
      home: game.home.name,
      homeAbbrev: game.home.abbrev,
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
