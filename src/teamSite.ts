import { usStateName } from './nwsWeather.ts'
import { stateFromTeamLabel, venueLooksNeutral } from './timeZones.ts'
import type { FrozenRecommendation, GameVenue } from './types'

export type TeamSite = 'home' | 'away' | 'neutral'
export type CbsSide = 'home' | 'away'

export type TeamSiteRef = {
  location?: string | null
  name?: string | null
  nickname?: string | null
  abbrev?: string | null
}

/** NFL buildings that also host bowls. Tenants play a real home game; everyone else is neutral. */
const NFL_STADIUM_TENANTS: Array<{
  stadium: RegExp
  abbrevs: string[]
  labels: string[]
}> = [
  {
    stadium: /sofi stadium/i,
    abbrevs: ['LAR', 'LAC'],
    labels: ['rams', 'chargers', 'la rams', 'la chargers', 'l a rams', 'l a chargers'],
  },
  {
    stadium: /lambeau/i,
    abbrevs: ['GB'],
    labels: ['packers', 'green bay'],
  },
  {
    stadium: /nissan stadium/i,
    abbrevs: ['TEN'],
    labels: ['titans'],
  },
  {
    stadium: /mercedes-benz stadium/i,
    abbrevs: ['ATL'],
    labels: ['falcons'],
  },
  {
    stadium: /at&t stadium/i,
    abbrevs: ['DAL'],
    labels: ['cowboys'],
  },
  {
    stadium: /allegiant/i,
    abbrevs: ['LV'],
    labels: ['raiders'],
  },
]

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\./g, '')
}

function teamLabels(team: TeamSiteRef) {
  return [team.location, team.name].filter(
    (value): value is string => Boolean(value?.trim()),
  )
}

function asTeamRef(
  team: TeamSiteRef | string | null | undefined,
): TeamSiteRef {
  if (!team) return {}
  if (typeof team === 'string') return { abbrev: team, name: team }
  return team
}

function nflStadiumTenants(venue: GameVenue | null | undefined) {
  const stadium = venue?.stadium ?? ''
  if (!stadium) return null
  return NFL_STADIUM_TENANTS.find((row) => row.stadium.test(stadium)) ?? null
}

export function teamIsStadiumTenant(
  team: TeamSiteRef | string | null | undefined,
  venue: GameVenue | null | undefined,
) {
  const tenants = nflStadiumTenants(venue)
  if (!tenants) return false
  const ref = asTeamRef(team)
  const abbrev = ref.abbrev?.trim().toUpperCase()
  if (abbrev && tenants.abbrevs.includes(abbrev)) return true
  const labels = [ref.name, ref.nickname, ref.location]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalize)
  return labels.some((label) => tenants.labels.includes(label))
}

export function knownNeutralVenue(venue: GameVenue | null | undefined) {
  return venueLooksNeutral(venue)
}

export function venuesSharePlace(
  left: GameVenue | null | undefined,
  right: GameVenue | null | undefined,
) {
  if (!left?.city || !left.state || !right?.city || !right.state) return false
  if (normalize(left.city) !== normalize(right.city)) return false
  const leftState = usStateName(left.state) ?? left.state
  const rightState = usStateName(right.state) ?? right.state
  if (normalize(leftState) !== normalize(rightState)) return false
  if (left.stadium && right.stadium) {
    return normalize(left.stadium) === normalize(right.stadium)
  }
  return true
}

export function venueMatchesTeamCity(
  venue: GameVenue | null | undefined,
  team: TeamSiteRef,
) {
  const city = venue?.city?.trim()
  if (!city) return false
  const cityNorm = normalize(city)
  return teamLabels(team).some((label) => normalize(label) === cityNorm)
}

export function teamHomeState(team: TeamSiteRef) {
  for (const label of teamLabels(team)) {
    const state = stateFromTeamLabel(label)
    if (state) return state
  }
  return null
}

export function venueMatchesTeamState(
  venue: GameVenue | null | undefined,
  team: TeamSiteRef,
) {
  const venueState = venue?.state ? usStateName(venue.state) : null
  const homeState = teamHomeState(team)
  return Boolean(venueState && homeState && venueState === homeState)
}

export function venueMatchesCollectedHome(
  venue: GameVenue | null | undefined,
  homes: GameVenue[],
) {
  return homes.some((home) => venuesSharePlace(venue, home))
}

export function collectHomeVenues(
  games: Array<{
    sport: string
    home: string
    venue: GameVenue | null | undefined
  }>,
) {
  const homeVenues = new Map<string, GameVenue[]>()
  for (const game of games) {
    if (!game.venue || knownNeutralVenue(game.venue)) continue
    if (nflStadiumTenants(game.venue) && !teamIsStadiumTenant(game.home, game.venue)) {
      continue
    }
    const key = `${game.sport}:${game.home}`
    const list = homeVenues.get(key) ?? []
    list.push(game.venue)
    homeVenues.set(key, list)
  }
  return homeVenues
}

/**
 * Site from the place, not the CBS home designation.
 * Missing venue falls back to the CBS side so unstamped recs keep working.
 */
export function siteForTeam(
  venue: GameVenue | null | undefined,
  team: TeamSiteRef,
  opponent: TeamSiteRef,
  teamHomes: GameVenue[],
  opponentHomes: GameVenue[],
  cbsSide: CbsSide,
): TeamSite {
  if (!venue?.city || !venue.state) return cbsSide
  if (knownNeutralVenue(venue)) return 'neutral'

  if (nflStadiumTenants(venue)) {
    const teamTenant = teamIsStadiumTenant(team, venue)
    const opponentTenant = teamIsStadiumTenant(opponent, venue)
    if (teamTenant && !opponentTenant) return 'home'
    if (opponentTenant && !teamTenant) return 'away'
    if (teamTenant && opponentTenant) return cbsSide
    return 'neutral'
  }

  const teamCity = venueMatchesTeamCity(venue, team)
  const opponentCity = venueMatchesTeamCity(venue, opponent)
  if (teamCity && !opponentCity) return 'home'
  if (opponentCity && !teamCity) return 'away'

  const teamState = venueMatchesTeamState(venue, team)
  const opponentState = venueMatchesTeamState(venue, opponent)
  if (teamState && !opponentState) return 'home'
  if (opponentState && !teamState) return 'away'

  const teamCollected = venueMatchesCollectedHome(venue, teamHomes)
  const opponentCollected = venueMatchesCollectedHome(venue, opponentHomes)
  if (teamCollected && !opponentCollected) return 'home'
  if (opponentCollected && !teamCollected) return 'away'

  return 'neutral'
}

export function classifyGameSites(
  venue: GameVenue | null | undefined,
  away: TeamSiteRef,
  home: TeamSiteRef,
  awayHomes: GameVenue[] = [],
  homeHomes: GameVenue[] = [],
) {
  return {
    away: siteForTeam(venue, away, home, awayHomes, homeHomes, 'away'),
    home: siteForTeam(venue, home, away, homeHomes, awayHomes, 'home'),
  }
}

export function gameIsNeutralSite(sites: { away: TeamSite; home: TeamSite }) {
  return sites.away === 'neutral' && sites.home === 'neutral'
}

export function recIsNeutralSite(
  rec: Pick<FrozenRecommendation, 'neutralSite' | 'venue'>,
) {
  if (typeof rec.neutralSite === 'boolean') return rec.neutralSite
  if (rec.venue) return knownNeutralVenue(rec.venue)
  return false
}

export function appearanceVenueWord(site: TeamSite) {
  if (site === 'home') return 'vs'
  if (site === 'away') return 'at'
  return 'neutral vs'
}

export function frozenNeutralSiteCaptured(game: { neutralSite?: boolean }) {
  return Object.hasOwn(game, 'neutralSite')
}

/** Stamp whether both sides are on a neutral site. After kickoff, keep the first stamp. */
export function attachFrozenNeutralSite<T extends { neutralSite?: boolean }>(
  frozen: T,
  game: {
    venue?: GameVenue | null
    away?: TeamSiteRef | string
    home?: TeamSiteRef | string
  },
  locked = false,
): T {
  if (locked && frozenNeutralSiteCaptured(frozen)) return frozen
  const sites = classifyGameSites(
    game.venue ?? null,
    asTeamRef(game.away),
    asTeamRef(game.home),
  )
  const neutralSite = gameIsNeutralSite(sites)
  if (frozen.neutralSite === neutralSite) return frozen
  return { ...frozen, neutralSite }
}
