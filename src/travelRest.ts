import { weeksForSeason } from './careerHistory.ts'
import { etDayKey } from './gameStatus.ts'
import {
  lastKickoffByKey,
  mergePreviousKickoff,
  scheduleKickoffBefore,
  type LastKickoffFile,
} from './lastKickoff.ts'
import { collectHomeVenues } from './teamSite.ts'
import {
  timeZoneFromTeamLabel,
  timeZoneFromVenue,
  travelZones,
  venueLooksNeutral,
} from './timeZones.ts'
import type {
  FrozenRecommendation,
  GameVenue,
  RecommendationHistory,
  Slate,
  SlateGame,
  Team,
} from './types'

export type RestKind = 'short' | 'normal' | 'long' | 'bye'
export type TravelDirection = 'east' | 'west' | 'same'

export type SideTravel = {
  zones: number
  direction: TravelDirection
  label: string
}

export type SideRest = {
  days: number
  kind: RestKind
  label: string
  /** For short-week rest: where they were coming from last kickoff (when known). */
  travelFrom?: string | null
}

export type GameTravelRest = {
  awayTravel: SideTravel | null
  homeTravel: SideTravel | null
  awayRest: SideRest | null
  homeRest: SideRest | null
}

export type AppearanceTravelRest = {
  travel: SideTravel | null
  rest: SideRest | null
}

type TeamRef = {
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  location?: string | null
  name?: string | null
}

type DatedGame = {
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  week: number
  kickoff: string
  away: string
  home: string
  venue: GameVenue | null
}

const REST_TITLE =
  'Rest uses the later of this team’s last CBS-card kickoff and its last season-schedule kickoff. College bye needs that schedule row — a card gap alone is still a long week.'

export function venuesEqual(
  left: GameVenue | null | undefined,
  right: GameVenue | null | undefined,
) {
  if (left == null && right == null) return true
  if (left == null || right == null) return false
  return (
    left.stadium === right.stadium &&
    left.city === right.city &&
    left.state === right.state &&
    left.indoor === right.indoor
  )
}

export function frozenVenueCaptured(game: { venue?: GameVenue | null }) {
  return Object.hasOwn(game, 'venue')
}

/** Stamp the slate venue. After kickoff, keep the first stamp. */
export function attachFrozenVenue<T extends { venue?: GameVenue | null }>(
  frozen: T,
  game: { venue?: GameVenue | null },
  locked = false,
): T {
  if (locked && frozenVenueCaptured(frozen)) return frozen
  const venue = game.venue ?? null
  if (venuesEqual(frozen.venue, venue)) return frozen
  return { ...frozen, venue }
}

function restDays(previousKickoff: string, kickoff: string) {
  const previous = etDayKey(previousKickoff)
  const next = etDayKey(kickoff)
  if (!previous || !next) return null
  const start = Date.parse(`${previous}T00:00:00Z`)
  const end = Date.parse(`${next}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.round((end - start) / 86_400_000)
}

export function classifyRest(
  days: number,
  sport: 'NFL' | 'NCAAF' = 'NCAAF',
  scheduleBacked = false,
): RestKind {
  if (days < 7) return 'short'
  if (days === 7) return 'normal'
  if (days >= 13 && (sport === 'NFL' || scheduleBacked)) return 'bye'
  return 'long'
}

export function formatRestLabel(days: number, kind: RestKind) {
  if (kind === 'short') return `Short week · ${days}d`
  if (kind === 'long') return `Long week · ${days}d`
  if (kind === 'bye') return `Off a bye · ${days}d`
  return `Normal week · ${days}d`
}

export function formatTravelLabel(zones: number, direction: TravelDirection) {
  if (direction === 'same' || zones === 0) return 'Same time zone'
  return `${zones} time zone${zones === 1 ? '' : 's'} ${direction}`
}

export const TRAVEL_SPLIT_KEYS = ['oneZone', 'twoZones', 'threePlus'] as const
export const REST_SPLIT_KEYS = ['short', 'normal', 'long', 'bye'] as const

export type TravelSplitKey = (typeof TRAVEL_SPLIT_KEYS)[number]
export type RestSplitKey = (typeof REST_SPLIT_KEYS)[number]

export const TRAVEL_SPLIT_LABELS: Record<TravelSplitKey, string> = {
  oneZone: '1 time zone',
  twoZones: '2 time zones',
  threePlus: '3+ time zones',
}

export const REST_SPLIT_LABELS: Record<RestSplitKey, string> = {
  short: 'Short week',
  normal: 'Normal week',
  long: 'Long week',
  bye: 'Off a bye',
}

export const TRAVEL_SPLIT_NOUNS: Record<TravelSplitKey, string> = {
  oneZone: '1-time-zone teams',
  twoZones: '2-time-zone teams',
  threePlus: '3+ time-zone teams',
}

export const REST_SPLIT_NOUNS: Record<RestSplitKey, string> = {
  short: 'short-week teams',
  normal: 'normal-week teams',
  long: 'long-week teams',
  bye: 'bye teams',
}

export function travelSplitKey(
  travel: SideTravel | null | undefined,
): TravelSplitKey | null {
  if (!travel || travel.direction === 'same' || travel.zones < 1) return null
  if (travel.zones === 1) return 'oneZone'
  if (travel.zones === 2) return 'twoZones'
  return 'threePlus'
}

export function restSplitKey(
  rest: SideRest | null | undefined,
): RestSplitKey | null {
  return rest?.kind ?? null
}

/** Hops that can train a player travel habit. 1-zone noise stays out. */
export const TRAVEL_HABIT_MIN_ZONES = 2

function hopZones(travel: SideTravel | null | undefined) {
  if (!travel || travel.direction === 'same' || travel.zones < 1) return 0
  return travel.zones
}

/** Side with the clear hop. Equal 2+ hops on both sides are a wash. */
export function travelingSide(
  away: SideTravel | null | undefined,
  home: SideTravel | null | undefined,
  minZones = TRAVEL_HABIT_MIN_ZONES,
): 'home' | 'away' | null {
  const awayZones = hopZones(away)
  const homeZones = hopZones(home)
  const awayHop = awayZones >= minZones
  const homeHop = homeZones >= minZones
  if (awayHop && homeHop) {
    if (awayZones === homeZones) return null
    return awayZones > homeZones ? 'away' : 'home'
  }
  if (awayHop) return 'away'
  if (homeHop) return 'home'
  return null
}

/** Side with fewer days of rest. Missing or tied rest is a wash. */
export function shorterRestSide(
  away: SideRest | null | undefined,
  home: SideRest | null | undefined,
): 'home' | 'away' | null {
  if (!away || !home) return null
  if (away.days === home.days) return null
  return away.days < home.days ? 'away' : 'home'
}

export function appearancePair(
  byAppearance: Map<string, AppearanceTravelRest> | undefined,
  cbsEventId: number,
) {
  return {
    away: byAppearance?.get(`${cbsEventId}:away`) ?? null,
    home: byAppearance?.get(`${cbsEventId}:home`) ?? null,
  }
}

/** Largest hop on the card — visitor or a home team that left its own zone. */
export function gameTravelZones(row: GameTravelRest | null | undefined) {
  if (!row) return 0
  const away =
    row.awayTravel && row.awayTravel.direction !== 'same'
      ? row.awayTravel.zones
      : 0
  const home =
    row.homeTravel && row.homeTravel.direction !== 'same'
      ? row.homeTravel.zones
      : 0
  return Math.max(away, home)
}

function sideRest(
  days: number | null,
  sport: 'NFL' | 'NCAAF',
  scheduleBacked = false,
  travelFrom?: string | null,
): SideRest | null {
  if (days == null || days < 0) return null
  const kind = classifyRest(days, sport, scheduleBacked)
  const base = { days, kind, label: formatRestLabel(days, kind) }
  if (kind !== 'short' || !travelFrom) return base
  return { ...base, travelFrom }
}

function sideTravel(
  fromTz: string | null,
  toTz: string | null,
  kickoff: string,
): SideTravel | null {
  const at = new Date(kickoff)
  if (Number.isNaN(at.getTime())) return null
  const hop = travelZones(fromTz, toTz, at)
  if (!hop) return null
  return { ...hop, label: formatTravelLabel(hop.zones, hop.direction) }
}

function rosterTeam(
  slate: Slate,
  sport: 'NFL' | 'NCAAF',
  abbrev: string,
): Team | null {
  for (const game of slate.games) {
    if (game.sport !== sport) continue
    if (game.away.abbrev === abbrev) return game.away
    if (game.home.abbrev === abbrev) return game.home
  }
  return null
}

function teamTimeZone(team: TeamRef, homeVenues: GameVenue[]) {
  const fromLabel =
    timeZoneFromTeamLabel(team.location ?? null) ??
    timeZoneFromTeamLabel(team.name ?? null)
  if (fromLabel) return fromLabel
  for (const venue of homeVenues) {
    if (venueLooksNeutral(venue)) continue
    const zone = timeZoneFromVenue(venue)
    if (zone) return zone
  }
  return null
}

function collectGames(slate: Slate, history: RecommendationHistory) {
  const seasonWeeks = weeksForSeason(history.weeks, slate.pool.seasonYear)
  const slateByEvent = new Map(slate.games.map((game) => [game.cbsEventId, game]))
  const games = new Map<number, DatedGame>()

  for (const week of seasonWeeks) {
    for (const game of week.games) {
      const live = slateByEvent.get(game.cbsEventId)
      games.set(game.cbsEventId, {
        cbsEventId: game.cbsEventId,
        sport: game.sport,
        week: week.week,
        kickoff: game.kickoff,
        away: game.away,
        home: game.home,
        venue: game.venue ?? live?.venue ?? null,
      })
    }
  }

  for (const game of slate.games) {
    if (games.has(game.cbsEventId)) {
      const existing = games.get(game.cbsEventId)
      if (existing && !existing.venue && game.venue) {
        games.set(game.cbsEventId, { ...existing, venue: game.venue })
      }
      continue
    }
    games.set(game.cbsEventId, {
      cbsEventId: game.cbsEventId,
      sport: game.sport,
      week: slate.week.order,
      kickoff: game.kickoff,
      away: game.away.abbrev,
      home: game.home.abbrev,
      venue: game.venue ?? null,
    })
  }

  return [...games.values()].sort(
    (left, right) =>
      left.kickoff.localeCompare(right.kickoff) ||
      left.cbsEventId - right.cbsEventId,
  )
}

function teamGames(games: DatedGame[], sport: string, abbrev: string) {
  return games.filter(
    (game) =>
      game.sport === sport && (game.away === abbrev || game.home === abbrev),
  )
}

function previousGame(games: DatedGame[], cbsEventId: number) {
  const index = games.findIndex((game) => game.cbsEventId === cbsEventId)
  if (index <= 0) return null
  return games[index - 1] ?? null
}

export function buildTravelRestIndex(
  slate: Slate,
  history: RecommendationHistory,
  lastKickoff: LastKickoffFile | null = null,
) {
  const games = collectGames(slate, history)
  const homeVenues = collectHomeVenues(games)
  const schedule = lastKickoffByKey(lastKickoff)

  const byEvent = new Map<number, GameTravelRest>()
  const byAppearance = new Map<string, AppearanceTravelRest>()

  for (const game of games) {
    const venueTz = timeZoneFromVenue(game.venue)
    const awayTeam = rosterTeam(slate, game.sport, game.away)
    const homeTeam = rosterTeam(slate, game.sport, game.home)
    const awayTz = teamTimeZone(
      {
        sport: game.sport,
        abbrev: game.away,
        location: awayTeam?.location,
        name: awayTeam?.name,
      },
      homeVenues.get(`${game.sport}:${game.away}`) ?? [],
    )
    const homeTz = teamTimeZone(
      {
        sport: game.sport,
        abbrev: game.home,
        location: homeTeam?.location,
        name: homeTeam?.name,
      },
      homeVenues.get(`${game.sport}:${game.home}`) ?? [],
    )

    const awayTravel = sideTravel(awayTz, venueTz, game.kickoff)
    const homeHop = sideTravel(homeTz, venueTz, game.kickoff)
    const homeTravel =
      homeHop && homeHop.direction !== 'same' ? homeHop : null

    const awayBook = teamGames(games, game.sport, game.away)
    const homeBook = teamGames(games, game.sport, game.home)
    const awayPrev = previousGame(awayBook, game.cbsEventId)
    const homePrev = previousGame(homeBook, game.cbsEventId)
    const awaySchedule = scheduleKickoffBefore(
      schedule.get(`${game.sport}:${game.away}`)?.lastKickoff,
      game.kickoff,
    )
    const homeSchedule = scheduleKickoffBefore(
      schedule.get(`${game.sport}:${game.home}`)?.lastKickoff,
      game.kickoff,
    )
    const awayKickoff = mergePreviousKickoff(awayPrev?.kickoff, awaySchedule)
    const homeKickoff = mergePreviousKickoff(homePrev?.kickoff, homeSchedule)

    // For "schedule-backed rest" (bye), we only want to allow bye when the
    // schedule row actually won the merge — not when a card kickoff was later.
    const awayKickoffFromSchedule = Boolean(
      awaySchedule && awayKickoff === awaySchedule,
    )
    const homeKickoffFromSchedule = Boolean(
      homeSchedule && homeKickoff === homeSchedule,
    )
    const awayKickoffFromCard = Boolean(
      awayPrev?.kickoff && awayKickoff === awayPrev.kickoff,
    )
    const homeKickoffFromCard = Boolean(
      homePrev?.kickoff && homeKickoff === homePrev.kickoff,
    )

    const venuePlace = (venue: GameVenue | null | undefined) => {
      if (!venue) return null
      if (venue.city && venue.state) return `${venue.city}, ${venue.state}`
      return venue.stadium ?? null
    }

    // For short-week rest only: if the team was the away side in the prior
    // kickoff game, show where they were coming from (the prior venue).
    const awayTravelFrom =
      awayKickoffFromCard && awayPrev?.away === game.away
        ? venuePlace(awayPrev.venue)
        : null
    const homeTravelFrom =
      homeKickoffFromCard && homePrev?.away === game.home
        ? venuePlace(homePrev.venue)
        : null

    const awayRest = sideRest(
      awayKickoff ? restDays(awayKickoff, game.kickoff) : null,
      game.sport,
      awayKickoffFromSchedule,
      awayTravelFrom,
    )
    const homeRest = sideRest(
      homeKickoff ? restDays(homeKickoff, game.kickoff) : null,
      game.sport,
      homeKickoffFromSchedule,
      homeTravelFrom,
    )

    byEvent.set(game.cbsEventId, {
      awayTravel,
      homeTravel,
      awayRest,
      homeRest,
    })
    byAppearance.set(`${game.cbsEventId}:away`, {
      travel: awayTravel,
      rest: awayRest,
    })
    byAppearance.set(`${game.cbsEventId}:home`, {
      travel: homeTravel,
      rest: homeRest,
    })
  }

  return { byEvent, byAppearance }
}

export function formatGameTravelLine(
  row: GameTravelRest,
  names?: { away?: string; home?: string },
) {
  const parts: string[] = []
  if (row.awayTravel && row.awayTravel.direction !== 'same') {
    const who = names?.away?.trim() || 'Away'
    parts.push(`${who} traveling ${row.awayTravel.label}`)
  }
  if (row.homeTravel) {
    const who = names?.home?.trim() || 'Home'
    parts.push(`${who} traveling ${row.homeTravel.label}`)
  }
  return parts.length ? parts.join(' · ') : null
}

export function formatGameRestLine(
  row: GameTravelRest,
  names?: { away?: string; home?: string },
) {
  const parts: string[] = []
  if (row.awayRest) {
    const who = names?.away?.trim() || 'Away'
    const from = row.awayRest.travelFrom ? ` · from ${row.awayRest.travelFrom}` : ''
    parts.push(`${who} ${row.awayRest.label}${from}`)
  }
  if (row.homeRest) {
    const who = names?.home?.trim() || 'Home'
    const from = row.homeRest.travelFrom ? ` · from ${row.homeRest.travelFrom}` : ''
    parts.push(`${who} ${row.homeRest.label}${from}`)
  }
  return parts.length ? `Rest: ${parts.join(' · ')}` : null
}

export function travelRestTitle() {
  return REST_TITLE
}

export function resolveGameVenue(
  frozen: Pick<FrozenRecommendation, 'venue'>,
  live?: Pick<SlateGame, 'venue'> | null,
) {
  if (frozenVenueCaptured(frozen)) return frozen.venue ?? null
  return live?.venue ?? frozen.venue ?? null
}
