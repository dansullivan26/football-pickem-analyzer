import type { NflAvailabilityTier, NflStarterInjuryFile } from './nflStarterInjuries.ts'
import { NFL_AVAILABILITY_ORDER } from './nflStarterInjuries.ts'
import type { OddsEvent, Slate, SlateGame } from './types.ts'

export type InjuryLineEvent = {
  at: string
  cbsEventId: number
  athleteId: string | null
  name: string
  position: string
  teamAbbrev: string
  teamName: string
  side: 'home' | 'away'
  fromStatus: string | null
  toStatus: string | null
  fromTier: NflAvailabilityTier | null
  toTier: NflAvailabilityTier | null
  availability: 'worse' | 'better'
  homeSpreadBefore: number | null
  homeSpreadAfter: number | null
  /** Positive means DraftKings moved toward this player's team. */
  towardTeam: number | null
}

export type InjuryLineHistory = {
  week: number
  seasonYear?: number
  label: string
  updatedAt: string
  note: string
  games: Array<{
    cbsEventId: number
    events: InjuryLineEvent[]
  }>
}

export const INJURY_LINE_NOTE =
  'Starter-status changes from the ESPN snapshot taken in the same hourly sportsbook refresh as DraftKings. A move in the same pull is coincidence, not proof the injury caused the line.'

type ListedStarter = {
  athleteId: string | null
  name: string
  position: string
  status: string
  tier: NflAvailabilityTier
  teamAbbrev: string
  teamName: string
}

function athleteKey(athleteId: string | null, name: string) {
  return athleteId ? `id:${athleteId}` : `name:${name.trim().toLowerCase()}`
}

function availabilityRank(tier: NflAvailabilityTier | null) {
  if (tier == null) return NFL_AVAILABILITY_ORDER.length
  return NFL_AVAILABILITY_ORDER.indexOf(tier)
}

function listedStarters(file: NflStarterInjuryFile | null | undefined) {
  const listed = new Map<string, ListedStarter>()
  for (const team of file?.teams ?? []) {
    for (const injury of team.injuries) {
      listed.set(athleteKey(injury.athleteId, injury.name), {
        athleteId: injury.athleteId,
        name: injury.name,
        position: injury.position,
        status: injury.status,
        tier: injury.tier,
        teamAbbrev: team.abbrev,
        teamName: team.name,
      })
    }
  }
  return listed
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatHomeSpread(value: number | null | undefined) {
  if (value == null) return '—'
  if (value === 0) return 'PK'
  const points = formatPoints(Math.abs(value))
  return value > 0 ? `+${points}` : `-${points}`
}

export function towardTeamDelta(
  homeBefore: number | null,
  homeAfter: number | null,
  side: 'home' | 'away',
) {
  if (homeBefore == null || homeAfter == null) return null
  const homeDelta = homeAfter - homeBefore
  return side === 'home' ? -homeDelta : homeDelta
}

export function dkLineThisPull(event: OddsEvent | undefined) {
  const dk = event?.lines.draftkings
  if (!dk || typeof dk.line !== 'number') {
    return { before: null, after: null }
  }
  return {
    before: typeof dk.previousLine === 'number' ? dk.previousLine : dk.line,
    after: dk.line,
  }
}

export function formatInjuryLineEvent(event: InjuryLineEvent) {
  const from = event.fromStatus ?? 'not listed'
  const to = event.toStatus ?? 'cleared'
  const status = `${event.name} (${event.teamAbbrev} ${event.position}) ${from} → ${to}`
  if (event.homeSpreadBefore == null || event.homeSpreadAfter == null) {
    return `${status}. No DraftKings print on that pull.`
  }
  if (
    event.towardTeam == null ||
    event.towardTeam === 0 ||
    event.homeSpreadBefore === event.homeSpreadAfter
  ) {
    return `${status}. DraftKings unchanged on that pull (${formatHomeSpread(event.homeSpreadAfter)} home).`
  }
  const other =
    event.side === 'home' ? 'the visitor' : 'the home team'
  const direction =
    event.towardTeam > 0
      ? `toward ${event.teamName}`
      : `toward ${other}`
  return `${status}. DraftKings moved ${formatPoints(Math.abs(event.towardTeam))} ${direction} on the same hourly pull (${formatHomeSpread(event.homeSpreadBefore)} → ${formatHomeSpread(event.homeSpreadAfter)} home).`
}

export function injuryLineEventsForGame(
  history: InjuryLineHistory | null | undefined,
  cbsEventId: number,
  week: number,
  seasonYear?: number,
) {
  if (!history || history.week !== week) return []
  if (
    seasonYear != null &&
    history.seasonYear != null &&
    history.seasonYear !== seasonYear
  ) {
    return []
  }
  return history.games.find((game) => game.cbsEventId === cbsEventId)?.events ?? []
}

function nflGameForTeam(slate: Slate, abbrev: string) {
  return slate.games.find(
    (game) =>
      game.sport === 'NFL' &&
      (game.away.abbrev === abbrev || game.home.abbrev === abbrev),
  )
}

function sideForTeam(game: SlateGame, abbrev: string): 'home' | 'away' {
  return game.home.abbrev === abbrev ? 'home' : 'away'
}

function buildEvent({
  at,
  previous,
  next,
  game,
  line,
}: {
  at: string
  previous: ListedStarter | null
  next: ListedStarter | null
  game: SlateGame
  line: { before: number | null; after: number | null }
}): InjuryLineEvent | null {
  const starter = next ?? previous
  if (!starter) return null
  const fromTier = previous?.tier ?? null
  const toTier = next?.tier ?? null
  if (fromTier === toTier) return null
  const fromRank = availabilityRank(fromTier)
  const toRank = availabilityRank(toTier)
  const side = sideForTeam(game, starter.teamAbbrev)
  return {
    at,
    cbsEventId: game.cbsEventId,
    athleteId: starter.athleteId,
    name: starter.name,
    position: starter.position,
    teamAbbrev: starter.teamAbbrev,
    teamName: starter.teamName,
    side,
    fromStatus: previous?.status ?? null,
    toStatus: next?.status ?? null,
    fromTier,
    toTier,
    availability: toRank > fromRank ? 'better' : 'worse',
    homeSpreadBefore: line.before,
    homeSpreadAfter: line.after,
    towardTeam: towardTeamDelta(line.before, line.after, side),
  }
}

export function updateInjuryLineHistory({
  previousHistory,
  previousInjuries,
  nextInjuries,
  slate,
  events,
  runAt,
}: {
  previousHistory: InjuryLineHistory | null
  previousInjuries: NflStarterInjuryFile | null
  nextInjuries: NflStarterInjuryFile
  slate: Slate
  events: OddsEvent[]
  runAt: string
}): InjuryLineHistory {
  const keepPrevious =
    previousHistory?.week === slate.week.order &&
    (previousHistory.seasonYear ?? null) ===
      (slate.pool.seasonYear ?? previousHistory.seasonYear ?? null)
      ? previousHistory
      : null
  const byEvent = new Map(
    (keepPrevious?.games ?? []).map((game) => [game.cbsEventId, game.events]),
  )
  const oddsByEvent = new Map(
    events
      .filter((event) => event.cbsEventId != null)
      .map((event) => [event.cbsEventId as number, event]),
  )
  const before = listedStarters(previousInjuries)
  const after = listedStarters(nextInjuries)
  const keys = new Set([...before.keys(), ...after.keys()])

  for (const key of keys) {
    const previous = before.get(key) ?? null
    const next = after.get(key) ?? null
    const starter = next ?? previous
    if (!starter) continue
    const game = nflGameForTeam(slate, starter.teamAbbrev)
    if (!game) continue
    const event = buildEvent({
      at: runAt,
      previous,
      next,
      game,
      line: dkLineThisPull(oddsByEvent.get(game.cbsEventId)),
    })
    if (!event) continue
    byEvent.set(game.cbsEventId, [...(byEvent.get(game.cbsEventId) ?? []), event])
  }

  const addedAt = runAt
  const games = [...byEvent.entries()]
    .map(([cbsEventId, gameEvents]) => ({
      cbsEventId,
      events: gameEvents,
    }))
    .filter((game) => game.events.length > 0)
    .sort((left, right) => left.cbsEventId - right.cbsEventId)

  const added = games.some((game) =>
    game.events.some((event) => event.at === addedAt),
  )
  if (keepPrevious && !added) return keepPrevious

  return {
    week: slate.week.order,
    seasonYear: slate.pool.seasonYear,
    label: slate.week.label,
    updatedAt: runAt,
    note: INJURY_LINE_NOTE,
    games,
  }
}
