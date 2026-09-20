import {
  classifyEdge,
  keyNumberHook,
  poolSpreadForSide,
  publicPctForSort,
  publicSupportForSide,
  type CardPickSource,
  type PickStrength,
} from './cardScoring.ts'
import type { GameTravelRest } from './travelRest.ts'
import { restSplitKey, travelSplitKey } from './travelRest.ts'
import { classifyGameSites } from './teamSite.ts'
import {
  teamKey,
  type TeamDirectory,
  type TeamRecord,
  type TeamSplit,
} from './teamPerformance.ts'
import type {
  EdgeCategory,
  GameAnalysis,
  SlateTiebreaker,
} from './types.ts'
import type { SuggestedCard, SuggestedPick, UnpickedGame } from './cardStrategy.ts'

export const RESULTS_STRATEGY_ID = 'v1-season-results'

export type ResultsMaturityKey = 'too-thin' | 'lean' | 'developing' | 'stronger'

export type ResultsMaturity = {
  key: ResultsMaturityKey
  label: string
  scoredWeeks: number
  detail: string
}

export function resultsMaturity(scoredWeeks: number): ResultsMaturity {
  if (scoredWeeks < 2) {
    return {
      key: 'too-thin',
      label: 'Too thin',
      scoredWeeks,
      detail:
        'Fewer than two officially scored weeks. Treat every pick as a sketch, not a book.',
    }
  }
  if (scoredWeeks < 4) {
    return {
      key: 'lean',
      label: 'Lean sample',
      scoredWeeks,
      detail:
        'A couple of scored weeks are in. Splits can still swing on one result.',
    }
  }
  if (scoredWeeks < 6) {
    return {
      key: 'developing',
      label: 'Developing sample',
      scoredWeeks,
      detail:
        'Enough scored weeks to lean on repeated team results, but not enough to trust narrow buckets.',
    }
  }
  return {
    key: 'stronger',
    label: 'Stronger sample',
    scoredWeeks,
    detail:
      'Several scored weeks support the broad team splits. Individual matchups can still reverse them.',
  }
}

export function resultsStrategyNote(maturity: ResultsMaturity) {
  return `Season-results card. ${maturity.label}: ${maturity.detail} It uses this year's covered CBS results (overall, site, favorite/dog, rest, travel), shrunk toward 50%. It is not the line-value card and should not replace it.`
}

function shrunkRate(split: TeamSplit) {
  const decided = split.wins + split.losses
  if (!decided) return null
  return (split.wins + 2) / (decided + 4)
}

function addSignal(
  parts: string[],
  score: { total: number; decided: number },
  split: TeamSplit,
  weight: number,
  label: string,
) {
  const rate = shrunkRate(split)
  const decided = split.wins + split.losses
  if (rate == null) return
  score.total += weight * (rate - 0.5)
  score.decided += decided
  parts.push(
    `${label} ${split.wins}-${split.losses} ATS (shrunk ${Math.round(rate * 100)}%)`,
  )
}

function restField(kind: ReturnType<typeof restSplitKey>) {
  if (kind === 'short') return 'shortRest' as const
  if (kind === 'normal') return 'normalRest' as const
  if (kind === 'long') return 'longRest' as const
  if (kind === 'bye') return 'byeRest' as const
  return null
}

function sideScore(
  team: TeamRecord,
  site: 'home' | 'away' | 'neutral',
  market: 'favorite' | 'dog' | 'pickem',
  rest: GameTravelRest | undefined,
  which: 'away' | 'home',
) {
  const score = { total: 0, decided: 0 }
  const parts: string[] = []
  addSignal(parts, score, team.overall, 1, 'overall')
  addSignal(parts, score, team[site], 0.8, site)
  if (market === 'favorite' || market === 'dog') {
    addSignal(parts, score, team[market], 0.8, market)
  }
  const restKind = restSplitKey(
    which === 'away' ? rest?.awayRest : rest?.homeRest,
  )
  const restKey = restField(restKind)
  if (restKey) addSignal(parts, score, team[restKey], 0.45, `${restKind} rest`)
  const travelKey = travelSplitKey(
    which === 'away' ? rest?.awayTravel : rest?.homeTravel,
  )
  if (travelKey) {
    addSignal(parts, score, team[travelKey], 0.45, `${travelKey} travel`)
  }
  return { ...score, parts }
}

function thresholdFor(maturity: ResultsMaturityKey) {
  if (maturity === 'too-thin') return 0.22
  if (maturity === 'lean') return 0.14
  if (maturity === 'developing') return 0.09
  return 0.06
}

function strengthFor(
  maturity: ResultsMaturityKey,
  diff: number,
): PickStrength {
  if (maturity === 'too-thin' || maturity === 'lean') return 'mild'
  if (diff >= 0.18) return 'strong'
  if (diff >= 0.12) return 'solid'
  return 'mild'
}

export type SeasonResultsDecision = {
  pickedSide: 'home' | 'away' | null
  category: EdgeCategory
  source: CardPickSource | null
  strength: PickStrength | null
  score: number | null
  compositeEdge: number | null
  poolSpread: number | null
  hook: 'fg' | 'td' | null
  detail: string
  skipReason: string | null
}

export function decideSeasonResultsPick(
  analysis: GameAnalysis,
  directory: TeamDirectory,
  travelRest: GameTravelRest | undefined,
  maturity: ResultsMaturity,
): SeasonResultsDecision {
  const { game } = analysis
  const away = directory.teams.find(
    (team) => team.key === teamKey(game.sport, game.away.abbrev),
  )
  const home = directory.teams.find(
    (team) => team.key === teamKey(game.sport, game.home.abbrev),
  )
  if (!away || !home) {
    return {
      pickedSide: null,
      category: 'pending',
      source: null,
      strength: null,
      score: null,
      compositeEdge: null,
      poolSpread: null,
      hook: null,
      detail: '',
      skipReason: 'No season ATS book for one or both sides yet',
    }
  }

  const sites = classifyGameSites(game.venue, game.away, game.home)
  const homeMarket =
    game.homeSpread < 0 ? 'favorite' : game.homeSpread > 0 ? 'dog' : 'pickem'
  const awayMarket =
    homeMarket === 'favorite'
      ? 'dog'
      : homeMarket === 'dog'
        ? 'favorite'
        : 'pickem'

  const awayScore = sideScore(
    away,
    sites.away,
    awayMarket,
    travelRest,
    'away',
  )
  const homeScore = sideScore(
    home,
    sites.home,
    homeMarket,
    travelRest,
    'home',
  )
  const net = homeScore.total - awayScore.total
  const diff = Math.abs(net)
  const decided = Math.min(
    away.overall.wins + away.overall.losses,
    home.overall.wins + home.overall.losses,
  )
  if (decided < 1) {
    return {
      pickedSide: null,
      category: 'neutral',
      source: null,
      strength: null,
      score: null,
      compositeEdge: null,
      poolSpread: null,
      hook: null,
      detail: '',
      skipReason: 'Neither side has a covered result yet',
    }
  }

  const needed = thresholdFor(maturity.key)
  if (diff < needed) {
    return {
      pickedSide: null,
      category: 'neutral',
      source: null,
      strength: null,
      score: null,
      compositeEdge: null,
      poolSpread: null,
      hook: null,
      detail: '',
      skipReason: `${maturity.label}: season ATS edge (${diff.toFixed(2)}) is inside the ${needed.toFixed(2)} bar`,
    }
  }

  const pickedSide = net > 0 ? 'home' : 'away'
  const winner = pickedSide === 'home' ? homeScore : awayScore
  const category = classifyEdge(diff * 20)
  const poolSpread = poolSpreadForSide(game.homeSpread, pickedSide)
  return {
    pickedSide,
    category: category === 'pending' ? 'slight' : category,
    source: 'season-results',
    strength: strengthFor(maturity.key, diff),
    score: Math.round(diff * 100),
    compositeEdge: diff,
    poolSpread,
    hook: keyNumberHook(poolSpread),
    detail: `${maturity.label}. ${game[pickedSide].abbrev} season book outscores the opponent (${diff.toFixed(2)}). ${winner.parts.slice(0, 3).join('; ')}.`,
    skipReason: null,
  }
}

export function generateSeasonResultsCard(
  analyses: GameAnalysis[],
  week: { order: number; label: string },
  seasonYear: number,
  tiebreaker: SlateTiebreaker | null | undefined,
  directory: TeamDirectory,
  scoredWeeks: number,
  generatedAt = new Date(),
  travelRestByEvent: ReadonlyMap<number, GameTravelRest> = new Map(),
): SuggestedCard {
  const maturity = resultsMaturity(scoredWeeks)
  const picks: SuggestedPick[] = []
  const unpicked: UnpickedGame[] = []

  for (const analysis of analyses) {
    const { game } = analysis
    const base = {
      gameId: game.id,
      cbsEventId: game.cbsEventId,
      away: game.away.name,
      awayAbbrev: game.away.abbrev,
      home: game.home.name,
      homeAbbrev: game.home.abbrev,
      kickoff: game.kickoff,
      kickoffLabel: game.kickoffLabel.replace(' ET', ''),
    }
    const decision = decideSeasonResultsPick(
      analysis,
      directory,
      travelRestByEvent.get(game.cbsEventId),
      maturity,
    )
    if (
      decision.pickedSide &&
      decision.source &&
      decision.strength &&
      decision.score != null &&
      decision.compositeEdge != null &&
      decision.poolSpread != null
    ) {
      picks.push({
        ...base,
        awayId: game.away.id,
        homeId: game.home.id,
        pickedSide: decision.pickedSide,
        pickedTeamId: game[decision.pickedSide].id,
        pickedTeam: game[decision.pickedSide].name,
        poolSpread: decision.poolSpread,
        source: decision.source,
        category: decision.category,
        edge: analysis.edge,
        strength: decision.strength,
        hook: decision.hook,
        publicSupport: publicSupportForSide(
          analysis.consensus,
          game.homeSpread,
          decision.pickedSide,
        ),
        publicPct: publicPctForSort(
          analysis.consensus,
          game.homeSpread,
          decision.pickedSide,
        ),
        score: decision.score,
        compositeEdge: decision.compositeEdge,
        detail: decision.detail,
      })
      continue
    }
    unpicked.push({
      ...base,
      awayId: game.away.id,
      homeId: game.home.id,
      homeSpread: game.homeSpread,
      reason: decision.skipReason ?? 'No season-results edge',
    })
  }

  const tiebreakerAnalysis = tiebreaker
    ? analyses.find((analysis) => analysis.game.id === tiebreaker.gameId)
    : undefined
  const draftKingsTotal =
    tiebreakerAnalysis?.odds?.totals?.draftkings ?? null

  return {
    strategyId: RESULTS_STRATEGY_ID,
    title: 'Season-results card',
    strategyNote: resultsStrategyNote(maturity),
    generatedAt: generatedAt.toISOString(),
    seasonYear,
    week: week.order,
    weekLabel: week.label,
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
