import {
  CARD_STRATEGY_NOTE,
  compareRecommendationOrder,
  formatPoolSpread,
  poolSpreadForSide,
  resolveCardPick,
  type CardPickSource,
  type PickStrength,
  type PublicSupport,
} from './cardScoring.ts'
import type { GameTravelRest } from './travelRest.ts'
import type { NflStarterInjuryTeam } from './nflStarterInjuries.ts'
import type { EdgeCategory, GameAnalysis, SlateTiebreaker } from './types.ts'
import { etDayKey } from './gameStatus.ts'

export {
  CARD_STRATEGY_NOTE,
  formatPoolSpread,
  PCT_PER_SPREAD_POINT,
  type PickStrength,
} from './cardScoring.ts'

/** Bump this when the pick rules change so generated cards stay labeled. */
export const CARD_STRATEGY_ID = 'v8-line-hook-injury-rest-travel'

export type SuggestedPick = {
  gameId: string
  cbsEventId: number
  away: string
  awayAbbrev: string
  awayId: string
  home: string
  homeAbbrev: string
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
  awayAbbrev: string
  awayId: string
  home: string
  homeAbbrev: string
  homeId: string
  homeSpread: number
  kickoff: string
  kickoffLabel: string
  reason: string
  leanSide?: 'home' | 'away' | null
  leanTeam?: string | null
  leanSpread?: number | null
  detail?: string | null
}

export type CardListRow =
  | { kind: 'pick'; pick: SuggestedPick }
  | { kind: 'unpicked'; game: UnpickedGame }

export type ManualPickSelections = ReadonlyMap<string, 'home' | 'away'>

export function formatCardKickoff(
  kickoff: string,
  timeZone = 'America/New_York',
) {
  const date = new Date(kickoff)
  if (Number.isNaN(date.getTime())) return null
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(/\s+/g, '')
    .replace('AM', 'am')
    .replace('PM', 'pm')
  return `${weekday} ${time}`
}

export type SuggestedCard = {
  strategyId: string
  title: string
  strategyNote: string
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
 * 2. Add key-number hook value.
 * 3. Add a capped NFL first-team injury term.
 * 4. Add capped rest and travel adjustments (at most one point combined).
 * 5. Covers remains informational and never selects or sorts a pick.
 * 6. A zero composite edge stays unpicked.
 */
export function generateSuggestedCard(
  analyses: GameAnalysis[],
  /**
   * Pool week, not `game.week`: a slate carries each sport's own week number,
   * so an NFL week 1 game can sit on pool Week 2.
   */
  week: { order: number; label: string },
  seasonYear: number,
  tiebreaker: SlateTiebreaker | null | undefined,
  generatedAt = new Date(),
  travelRestByEvent: ReadonlyMap<number, GameTravelRest> = new Map(),
  injuriesByAbbrev: ReadonlyMap<string, NflStarterInjuryTeam> = new Map(),
): SuggestedCard {
  const picks: SuggestedPick[] = []
  const unpicked: UnpickedGame[] = []

  for (const analysis of analyses) {
    const { game, category, recommendedSide, consensus } = analysis
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

    const cardPick = resolveCardPick({
      category,
      recommendedSide,
      edge: analysis.edge,
      homeSpread: game.homeSpread,
      liveHomeSpread: analysis.liveHomeSpread,
      consensus,
      travelRest: travelRestByEvent.get(game.cbsEventId),
      injuries:
        game.sport === 'NFL'
          ? {
              away: injuriesByAbbrev.get(game.away.abbrev),
              home: injuriesByAbbrev.get(game.home.abbrev),
            }
          : undefined,
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
      awayId: game.away.id,
      homeId: game.home.id,
      homeSpread: game.homeSpread,
      reason: cardPick.skipReason ?? unpickedReason(analysis),
      leanSide: cardPick.leanSide,
      leanTeam: cardPick.leanSide ? game[cardPick.leanSide].name : null,
      leanSpread: cardPick.poolSpread,
      detail: cardPick.detail,
    })
  }

  const tiebreakerAnalysis = tiebreaker
    ? analyses.find((analysis) => analysis.game.id === tiebreaker.gameId)
    : undefined
  const draftKingsTotal =
    tiebreakerAnalysis?.odds?.totals?.draftkings ?? null

  return {
    strategyId: CARD_STRATEGY_ID,
    title: 'ATS card',
    strategyNote: CARD_STRATEGY_NOTE,
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

function unpickedReason(analysis: GameAnalysis) {
  const { category } = analysis
  if (category === 'pending') {
    return 'No DraftKings line and no rest or travel advantage'
  }
  return 'No line-value, hook, injury, rest, or travel advantage'
}

export function oppositeSide(side: 'home' | 'away') {
  return side === 'home' ? 'away' : 'home'
}

function sideAbbrev(
  teams: { awayAbbrev: string; homeAbbrev: string },
  side: 'home' | 'away',
) {
  return side === 'home' ? teams.homeAbbrev : teams.awayAbbrev
}

export function submittedPick(pick: SuggestedPick, deviate: boolean) {
  const side = deviate ? oppositeSide(pick.pickedSide) : pick.pickedSide
  return {
    pickedSide: side,
    pickedTeamId: side === 'home' ? pick.homeId : pick.awayId,
    pickedTeam: side === 'home' ? pick.home : pick.away,
    pickedAbbrev: sideAbbrev(pick, side),
    poolSpread: deviate ? -pick.poolSpread : pick.poolSpread,
  }
}

export function submittedManualPick(
  game: UnpickedGame,
  side: 'home' | 'away',
) {
  return {
    gameId: game.gameId,
    pickedSide: side,
    pickedTeamId: side === 'home' ? game.homeId : game.awayId,
    pickedTeam: side === 'home' ? game.home : game.away,
    pickedAbbrev: sideAbbrev(game, side),
    poolSpread: poolSpreadForSide(game.homeSpread, side),
  }
}

export function sortSuggestedPicks(
  picks: SuggestedPick[],
  sort: 'slate' | 'recommendation',
) {
  if (sort === 'slate') {
    return [...picks].sort(
      (left, right) =>
        left.kickoff.localeCompare(right.kickoff) ||
        left.cbsEventId - right.cbsEventId,
    )
  }
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

function rowKickoff(row: CardListRow) {
  return row.kind === 'pick' ? row.pick.kickoff : row.game.kickoff
}

function rowEventId(row: CardListRow) {
  return row.kind === 'pick' ? row.pick.cbsEventId : row.game.cbsEventId
}

/** Kickoff sort feathers manual-review games into the slate. Recommendation sort keeps them last. */
export function orderCardRows(
  picks: SuggestedPick[],
  unpicked: UnpickedGame[],
  sort: 'slate' | 'recommendation',
): CardListRow[] {
  const pickRows: CardListRow[] = sortSuggestedPicks(picks, sort).map(
    (pick) => ({ kind: 'pick', pick }),
  )
  const unpickedRows: CardListRow[] = [...unpicked]
    .sort(
      (left, right) =>
        left.kickoff.localeCompare(right.kickoff) ||
        left.cbsEventId - right.cbsEventId,
    )
    .map((game) => ({ kind: 'unpicked', game }))
  if (sort === 'recommendation') return [...pickRows, ...unpickedRows]
  return [...pickRows, ...unpickedRows].sort(
    (left, right) =>
      rowKickoff(left).localeCompare(rowKickoff(right)) ||
      rowEventId(left) - rowEventId(right),
  )
}

function formatCopiedPick(team: string, spread: number) {
  return `${team} ${formatPoolSpread(spread)}`
}

function formatCopiedNet(value: number) {
  if (Number.isInteger(value)) return String(value)
  const hundredths = Math.round(value * 100) / 100
  const tenths = Math.round(value * 10) / 10
  if (Math.abs(hundredths - tenths) < 1e-9) return tenths.toFixed(1)
  return hundredths.toFixed(2)
}

/** #1 on Recommendation sort — the play a buddy should see first in a paste. */
export function playOfTheWeek(picks: SuggestedPick[]) {
  return sortSuggestedPicks(picks, 'recommendation')[0] ?? null
}

function formatPlayOfTheWeekHeader(pick: SuggestedPick) {
  const line = formatCopiedPick(sideAbbrev(pick, pick.pickedSide), pick.poolSpread)
  return `Play of the week: ${line} (${pick.category} · ${formatCopiedNet(pick.compositeEdge)}-pt net)`
}

function formatCopiedRecommendedLine(
  pick: SuggestedPick,
  deviate: boolean,
  potwGameId: string | null,
) {
  const sent = submittedPick(pick, deviate)
  const base = formatCopiedPick(sent.pickedAbbrev, sent.poolSpread)
  if (deviate) return `${base} (deviated)`
  if (potwGameId === pick.gameId) {
    return `${base} (${pick.category} — play of the week)`
  }
  return `${base} (${pick.category})`
}

/**
 * Manual-review games still belong in the copied card so the whole slate is
 * accounted for, but they are tagged so a picked side is never confused with a
 * recommendation the card actually made.
 */
function formatCopiedManualLine(
  game: UnpickedGame,
  side: 'home' | 'away' | undefined,
) {
  if (side) {
    const sent = submittedManualPick(game, side)
    return `${formatCopiedPick(sent.pickedAbbrev, sent.poolSpread)} (manual pick)`
  }
  if (game.leanSide && game.leanSpread != null) {
    return `${formatCopiedPick(sideAbbrev(game, game.leanSide), game.leanSpread)} (lean only, no pick)`
  }
  return `${game.awayAbbrev} @ ${game.homeAbbrev} (manual review, no lean)`
}

export type CardDayGroup = {
  dateKey: string
  weekday: string
  label: string
  rows: CardListRow[]
}

function formatCardWeekday(
  kickoff: string,
  timeZone = 'America/New_York',
) {
  const date = new Date(kickoff)
  if (Number.isNaN(date.getTime())) return null
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
    }).format(date)
    const year = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
    }).format(date)
    const month = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: '2-digit',
    }).format(date)
    const day = new Intl.DateTimeFormat('en-US', {
      timeZone,
      day: '2-digit',
    }).format(date)
    return { weekday, dateKey: `${year}-${month}-${day}` }
  } catch {
    return null
  }
}

function cardDayLabel(
  kickoff: string,
  dateKey: string,
  weekday: string,
  now = Date.now(),
  timeZone = 'America/New_York',
) {
  const date = new Date(kickoff)
  if (Number.isNaN(date.getTime())) return weekday
  const monthDay = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(date)
  return etDayKey(now) === dateKey
    ? `Today · ${weekday} · ${monthDay}`
    : `${weekday} · ${monthDay}`
}

/** Chronological day buckets. Row order inside a day is kept. */
export function groupCardRowsByDay(
  rows: CardListRow[],
  now = Date.now(),
  timeZone = 'America/New_York',
): CardDayGroup[] {
  const groups = new Map<string, CardDayGroup>()
  for (const row of rows) {
    const day = formatCardWeekday(rowKickoff(row), timeZone)
    const dateKey = day?.dateKey ?? 'unknown'
    const weekday = day?.weekday ?? 'Unknown'
    const existing = groups.get(dateKey)
    if (existing) {
      existing.rows.push(row)
      continue
    }
    groups.set(dateKey, {
      dateKey,
      weekday,
      label: cardDayLabel(rowKickoff(row), dateKey, weekday, now, timeZone),
      rows: [row],
    })
  }
  return [...groups.values()].sort((left, right) =>
    left.dateKey.localeCompare(right.dateKey),
  )
}

export function formatSuggestedCardText(
  card: SuggestedCard,
  picks: SuggestedPick[] = card.picks,
  deviations: ReadonlySet<string> = new Set(),
  _tiebreakerAnswer: number | null = null,
  manualSelections: ManualPickSelections = new Map(),
  sort: 'slate' | 'recommendation' = 'slate',
) {
  const potw = playOfTheWeek(picks)
  const groups = groupCardRowsByDay(orderCardRows(picks, card.unpicked, sort))
  const body = groups
    .map((group) => {
      const lines = group.rows.map((row) => {
        if (row.kind === 'pick') {
          return formatCopiedRecommendedLine(
            row.pick,
            deviations.has(row.pick.gameId),
            potw?.gameId ?? null,
          )
        }
        return formatCopiedManualLine(
          row.game,
          manualSelections.get(row.game.gameId),
        )
      })
      return `${group.weekday}:\n\n${lines.join('\n')}`
    })
    .filter(Boolean)
    .join('\n\n')
  if (!potw) return body
  const header = formatPlayOfTheWeekHeader(potw)
  return body ? `${header}\n\n${body}` : header
}
