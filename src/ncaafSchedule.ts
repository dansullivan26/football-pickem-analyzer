import {
  cfbdGameKickoff,
  cfbdGameTeam,
  matchCfbdSchool,
  normalizeScheduleName,
  scheduleKickoffBefore,
} from './lastKickoff.ts'
import type { CommonOpponentsBreakdown } from './commonOpponents.ts'
import type { TeamVenue } from './teamPerformance.ts'

export type NcaafScheduleGame = {
  id: string
  kickoff: string
  home: string
  away: string
  homeScore: number
  awayScore: number
  neutralSite: boolean
}

export type NcaafScheduleFile = {
  updatedAt: string | null
  seasonYear: number
  games: NcaafScheduleGame[]
}

export type OffSlateMeeting = {
  teamName: string
  kickoff: string
  venue: TeamVenue
  result: 'win' | 'loss' | 'tie'
  ours: number
  theirs: number
}

export type OffSlateGroup = {
  kind: 'head-to-head' | 'shared'
  opponentName: string
  opponentKey: string
  away: OffSlateMeeting
  home: OffSlateMeeting
}

export type OffSlateBreakdown = {
  heading: string
  groups: OffSlateGroup[]
}

export function emptyNcaafSchedule(seasonYear: number): NcaafScheduleFile {
  return { updatedAt: null, seasonYear, games: [] }
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function cfbdGamePoints(
  game: Record<string, unknown>,
  side: 'home' | 'away',
) {
  if (side === 'home') {
    return asNumber(game.homePoints ?? game.home_points)
  }
  return asNumber(game.awayPoints ?? game.away_points)
}

function cfbdGameId(game: Record<string, unknown>) {
  const id = game.id ?? game.gameId ?? game.game_id
  if (typeof id === 'number' || typeof id === 'string') return String(id)
  return null
}

function cfbdNeutralSite(game: Record<string, unknown>) {
  return game.neutralSite === true || game.neutral_site === true
}

function cfbdCompleted(game: Record<string, unknown>) {
  if (game.completed === false) return false
  return true
}

export function ncaafScheduleFromCfbdGames(
  games: Record<string, unknown>[],
  nowMs: number,
): NcaafScheduleGame[] {
  const seen = new Set<string>()
  const rows: NcaafScheduleGame[] = []
  for (const game of games) {
    if (!cfbdCompleted(game)) continue
    const kickoff = cfbdGameKickoff(game)
    const home = cfbdGameTeam(game, 'home')
    const away = cfbdGameTeam(game, 'away')
    const homeScore = cfbdGamePoints(game, 'home')
    const awayScore = cfbdGamePoints(game, 'away')
    if (!kickoff || !home || !away || homeScore == null || awayScore == null) {
      continue
    }
    const at = Date.parse(kickoff)
    if (Number.isNaN(at) || at > nowMs) continue
    const id = cfbdGameId(game) ?? `${kickoff}|${away}|${home}`
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({
      id,
      kickoff,
      home,
      away,
      homeScore,
      awayScore,
      neutralSite: cfbdNeutralSite(game),
    })
  }
  return rows.sort(
    (left, right) =>
      left.kickoff.localeCompare(right.kickoff) ||
      left.id.localeCompare(right.id),
  )
}

function schoolsInSchedule(games: readonly NcaafScheduleGame[]) {
  return [
    ...new Set(games.flatMap((game) => [game.home, game.away])),
  ]
}

function priorGamesForSchool(
  games: readonly NcaafScheduleGame[],
  school: string,
  beforeKickoff: string,
) {
  const schoolNorm = normalizeScheduleName(school)
  return games.filter((game) => {
    if (!scheduleKickoffBefore(game.kickoff, beforeKickoff)) return false
    const home = normalizeScheduleName(game.home)
    const away = normalizeScheduleName(game.away)
    return home === schoolNorm || away === schoolNorm
  })
}

function opponentOf(game: NcaafScheduleGame, school: string) {
  const schoolNorm = normalizeScheduleName(school)
  if (normalizeScheduleName(game.home) === schoolNorm) return game.away
  if (normalizeScheduleName(game.away) === schoolNorm) return game.home
  return null
}

function latestAgainst(
  games: readonly NcaafScheduleGame[],
  school: string,
  opponent: string,
) {
  const opponentNorm = normalizeScheduleName(opponent)
  const rows = games.filter(
    (game) => normalizeScheduleName(opponentOf(game, school) ?? '') === opponentNorm,
  )
  return (
    [...rows].sort(
      (left, right) =>
        right.kickoff.localeCompare(left.kickoff) ||
        right.id.localeCompare(left.id),
    )[0] ?? null
  )
}

function meetingFor(
  teamName: string,
  school: string,
  game: NcaafScheduleGame,
): OffSlateMeeting | null {
  const schoolNorm = normalizeScheduleName(school)
  const home = normalizeScheduleName(game.home) === schoolNorm
  const away = normalizeScheduleName(game.away) === schoolNorm
  if (!home && !away) return null
  const ours = home ? game.homeScore : game.awayScore
  const theirs = home ? game.awayScore : game.homeScore
  const venue: TeamVenue = game.neutralSite
    ? 'neutral'
    : home
      ? 'home'
      : 'away'
  const result =
    ours > theirs ? 'win' : ours < theirs ? 'loss' : 'tie'
  return {
    teamName,
    kickoff: game.kickoff,
    venue,
    result,
    ours,
    theirs,
  }
}

function skipKeysFromCbs(cbs: CommonOpponentsBreakdown | null) {
  const keys = new Set<string>()
  for (const group of cbs?.groups ?? []) {
    const name = normalizeScheduleName(group.opponentName)
    if (name) keys.add(name)
  }
  return keys
}

function compareGroups(left: OffSlateGroup, right: OffSlateGroup) {
  if (left.kind !== right.kind) {
    return left.kind === 'head-to-head' ? -1 : 1
  }
  const latest = (group: OffSlateGroup) =>
    group.away.kickoff > group.home.kickoff
      ? group.away.kickoff
      : group.home.kickoff
  return (
    latest(right).localeCompare(latest(left)) ||
    left.opponentName.localeCompare(right.opponentName)
  )
}

export function formatOffSlateDate(kickoff: string) {
  const date = new Date(kickoff)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function offSlateSiteWord(venue: TeamVenue) {
  if (venue === 'home') return 'home'
  if (venue === 'away') return 'road'
  return 'neutral'
}

export function formatOffSlateMeeting(meeting: OffSlateMeeting) {
  const date = formatOffSlateDate(meeting.kickoff)
  const when = date ? ` ${date}` : ''
  return `${meeting.teamName}${when} ${offSlateSiteWord(meeting.venue)} ${meeting.result} ${meeting.ours}–${meeting.theirs}`
}

export function formatOffSlateHeading(groups: OffSlateGroup[]) {
  const shared = groups.filter((group) => group.kind === 'shared').length
  const parts: string[] = []
  if (groups.some((group) => group.kind === 'head-to-head')) {
    parts.push('They already met off the CBS card')
  }
  if (shared === 1) parts.push('1 shared opponent off the CBS card')
  if (shared > 1) parts.push(`${shared} shared opponents off the CBS card`)
  return parts.join(' · ')
}

export function offSlateCommonOpponents(
  game: {
    sport: 'NFL' | 'NCAAF'
    kickoff: string
    away: { abbrev: string; name: string; location?: string | null }
    home: { abbrev: string; name: string; location?: string | null }
  },
  schedule: NcaafScheduleFile | null | undefined,
  cbs: CommonOpponentsBreakdown | null = null,
): OffSlateBreakdown | null {
  if (game.sport !== 'NCAAF') return null
  const games = schedule?.games ?? []
  if (!games.length) return null
  const schools = schoolsInSchedule(games)
  const awaySchool = matchCfbdSchool(
    {
      sport: 'NCAAF',
      abbrev: game.away.abbrev,
      location: game.away.location,
      name: game.away.name,
    },
    schools,
  )
  const homeSchool = matchCfbdSchool(
    {
      sport: 'NCAAF',
      abbrev: game.home.abbrev,
      location: game.home.location,
      name: game.home.name,
    },
    schools,
  )
  if (!awaySchool || !homeSchool) return null

  const priorAway = priorGamesForSchool(games, awaySchool, game.kickoff)
  const priorHome = priorGamesForSchool(games, homeSchool, game.kickoff)
  const skip = skipKeysFromCbs(cbs)
  const groups: OffSlateGroup[] = []

  const h2h = latestAgainst(priorAway, awaySchool, homeSchool)
  if (h2h && !cbs?.groups.some((group) => group.kind === 'head-to-head')) {
    const awayMeeting = meetingFor(game.away.name, awaySchool, h2h)
    const homeMeeting = meetingFor(game.home.name, homeSchool, h2h)
    if (awayMeeting && homeMeeting) {
      groups.push({
        kind: 'head-to-head',
        opponentName: homeSchool,
        opponentKey: normalizeScheduleName(homeSchool),
        away: awayMeeting,
        home: homeMeeting,
      })
    }
  }

  const awayOpponents = new Set(
    priorAway
      .map((row) => opponentOf(row, awaySchool))
      .filter((value): value is string => Boolean(value))
      .map(normalizeScheduleName),
  )
  const shared = [
    ...new Set(
      priorHome
        .map((row) => opponentOf(row, homeSchool))
        .filter((value): value is string => Boolean(value)),
    ),
  ].filter((opponent) => {
    const key = normalizeScheduleName(opponent)
    if (!awayOpponents.has(key)) return false
    if (key === normalizeScheduleName(awaySchool)) return false
    if (key === normalizeScheduleName(homeSchool)) return false
    if (skip.has(key)) return false
    return true
  })

  for (const opponent of shared) {
    const awayGame = latestAgainst(priorAway, awaySchool, opponent)
    const homeGame = latestAgainst(priorHome, homeSchool, opponent)
    if (!awayGame || !homeGame) continue
    const awayMeeting = meetingFor(game.away.name, awaySchool, awayGame)
    const homeMeeting = meetingFor(game.home.name, homeSchool, homeGame)
    if (!awayMeeting || !homeMeeting) continue
    const opponentName =
      opponentOf(awayGame, awaySchool) ??
      opponentOf(homeGame, homeSchool) ??
      opponent
    groups.push({
      kind: 'shared',
      opponentName,
      opponentKey: normalizeScheduleName(opponentName),
      away: awayMeeting,
      home: homeMeeting,
    })
  }

  if (!groups.length) return null
  const ordered = [...groups].sort(compareGroups)
  return {
    heading: formatOffSlateHeading(ordered),
    groups: ordered,
  }
}
