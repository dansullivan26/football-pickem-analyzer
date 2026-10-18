import { formatPoolSpread, poolSpreadForSide } from './cardScoring.ts'
import { appearanceVenueWord } from './teamSite.ts'
import {
  teamKey,
  type CoverOutcome,
  type TeamAppearance,
  type TeamRecord,
  type TeamVenue,
} from './teamPerformance.ts'

export type CommonOpponentTeam = Pick<
  TeamRecord,
  'abbrev' | 'name' | 'location' | 'appearances'
>

export type CommonOpponentMeeting = {
  teamAbbrev: string
  teamName: string
  week: number
  weekLabel: string
  kickoff: string
  cbsEventId: number
  venue: TeamVenue
  spread: number
  result: CoverOutcome
  ours: number | null
  theirs: number | null
}

export type CommonOpponentGroup = {
  kind: 'head-to-head' | 'shared'
  opponentAbbrev: string
  opponentName: string
  away: CommonOpponentMeeting
  home: CommonOpponentMeeting
}

export type CommonOpponentsBreakdown = {
  heading: string
  groups: CommonOpponentGroup[]
}

export type CommonOpponentGame = {
  sport: 'NFL' | 'NCAAF'
  kickoff: string
  cbsEventId: number
  away: { abbrev: string; name: string }
  home: { abbrev: string; name: string }
}

function priorAppearances(
  appearances: readonly TeamAppearance[],
  beforeKickoff: string,
  excludeEventId: number,
) {
  const before = Date.parse(beforeKickoff)
  if (Number.isNaN(before)) return []
  return appearances.filter((row) => {
    if (row.cbsEventId === excludeEventId) return false
    const kick = Date.parse(row.kickoff)
    return !Number.isNaN(kick) && kick < before
  })
}

function latestAgainst(
  appearances: readonly TeamAppearance[],
  opponentAbbrev: string,
) {
  return (
    [...appearances]
      .filter((row) => row.opponentAbbrev === opponentAbbrev)
      .sort(
        (left, right) =>
          right.kickoff.localeCompare(left.kickoff) ||
          right.cbsEventId - left.cbsEventId,
      )[0] ?? null
  )
}

function toMeeting(
  team: { abbrev: string; name: string },
  row: TeamAppearance,
): CommonOpponentMeeting {
  const ours = row.side === 'home' ? row.homeScore : row.awayScore
  const theirs = row.side === 'home' ? row.awayScore : row.homeScore
  return {
    teamAbbrev: team.abbrev,
    teamName: team.name,
    week: row.week,
    weekLabel: row.weekLabel,
    kickoff: row.kickoff,
    cbsEventId: row.cbsEventId,
    venue: row.venue,
    spread: poolSpreadForSide(row.homeSpread, row.side),
    result: row.result,
    ours: typeof ours === 'number' ? ours : null,
    theirs: typeof theirs === 'number' ? theirs : null,
  }
}

function resultWord(result: CoverOutcome) {
  if (result === 'win') return 'cover'
  if (result === 'loss') return 'miss'
  if (result === 'push') return 'push'
  return 'pending'
}

export function formatCommonOpponentMeeting(meeting: CommonOpponentMeeting) {
  const score =
    meeting.ours != null && meeting.theirs != null
      ? ` ${meeting.ours}–${meeting.theirs}`
      : ''
  return `${meeting.teamName} W${meeting.week} ${appearanceVenueWord(meeting.venue)} ${formatPoolSpread(meeting.spread)} ${resultWord(meeting.result)}${score}`
}

export function formatCommonOpponentsHeading(groups: CommonOpponentGroup[]) {
  const shared = groups.filter((group) => group.kind === 'shared').length
  const parts: string[] = []
  if (groups.some((group) => group.kind === 'head-to-head')) {
    parts.push('They already met')
  }
  if (shared === 1) parts.push('1 shared CBS opponent')
  if (shared > 1) parts.push(`${shared} shared CBS opponents`)
  return parts.join(' · ')
}

function compareGroups(left: CommonOpponentGroup, right: CommonOpponentGroup) {
  if (left.kind !== right.kind) {
    return left.kind === 'head-to-head' ? -1 : 1
  }
  const latest = (group: CommonOpponentGroup) =>
    group.away.kickoff > group.home.kickoff
      ? group.away.kickoff
      : group.home.kickoff
  return (
    latest(right).localeCompare(latest(left)) ||
    left.opponentName.localeCompare(right.opponentName) ||
    left.opponentAbbrev.localeCompare(right.opponentAbbrev)
  )
}

export function commonOpponentsForTeams(
  game: CommonOpponentGame,
  awayTeam: CommonOpponentTeam,
  homeTeam: CommonOpponentTeam,
): CommonOpponentsBreakdown | null {
  const priorAway = priorAppearances(
    awayTeam.appearances,
    game.kickoff,
    game.cbsEventId,
  )
  const priorHome = priorAppearances(
    homeTeam.appearances,
    game.kickoff,
    game.cbsEventId,
  )
  const groups: CommonOpponentGroup[] = []

  const h2hAwayByEvent = new Map(
    priorAway
      .filter((row) => row.opponentAbbrev === homeTeam.abbrev)
      .map((row) => [row.cbsEventId, row]),
  )
  for (const homeRow of priorHome.filter(
    (row) => row.opponentAbbrev === awayTeam.abbrev,
  )) {
    const awayRow = h2hAwayByEvent.get(homeRow.cbsEventId)
    if (!awayRow) continue
    groups.push({
      kind: 'head-to-head',
      opponentAbbrev: homeTeam.abbrev,
      opponentName: homeTeam.name,
      away: toMeeting(game.away, awayRow),
      home: toMeeting(game.home, homeRow),
    })
  }

  const awayOpponents = new Set(priorAway.map((row) => row.opponentAbbrev))
  const sharedAbbrevs = [...new Set(priorHome.map((row) => row.opponentAbbrev))]
    .filter(
      (abbrev) =>
        awayOpponents.has(abbrev) &&
        abbrev !== game.away.abbrev &&
        abbrev !== game.home.abbrev,
    )
    .sort()

  for (const abbrev of sharedAbbrevs) {
    const awayRow = latestAgainst(priorAway, abbrev)
    const homeRow = latestAgainst(priorHome, abbrev)
    if (!awayRow || !homeRow) continue
    groups.push({
      kind: 'shared',
      opponentAbbrev: abbrev,
      opponentName: awayRow.opponent || homeRow.opponent || abbrev,
      away: toMeeting(game.away, awayRow),
      home: toMeeting(game.home, homeRow),
    })
  }

  if (!groups.length) return null
  const ordered = [...groups].sort(compareGroups)
  return {
    heading: formatCommonOpponentsHeading(ordered),
    groups: ordered,
  }
}

export function sportForMatchup(
  awayAbbrev: string,
  homeAbbrev: string,
  teamsByKey: ReadonlyMap<string, CommonOpponentTeam>,
): 'NFL' | 'NCAAF' | null {
  for (const sport of ['NFL', 'NCAAF'] as const) {
    if (
      teamsByKey.has(teamKey(sport, awayAbbrev)) &&
      teamsByKey.has(teamKey(sport, homeAbbrev))
    ) {
      return sport
    }
  }
  return null
}

export function commonOpponentsForGame(
  game: CommonOpponentGame,
  teamsByKey: ReadonlyMap<string, CommonOpponentTeam>,
  teamKeyOf: (sport: 'NFL' | 'NCAAF', abbrev: string) => string = teamKey,
): CommonOpponentsBreakdown | null {
  const awayTeam = teamsByKey.get(teamKeyOf(game.sport, game.away.abbrev))
  const homeTeam = teamsByKey.get(teamKeyOf(game.sport, game.home.abbrev))
  if (!awayTeam || !homeTeam) return null
  return commonOpponentsForTeams(game, awayTeam, homeTeam)
}

export function commonOpponentsForAbbrevs(
  away: { abbrev: string; name: string },
  home: { abbrev: string; name: string },
  kickoff: string,
  cbsEventId: number,
  teamsByKey: ReadonlyMap<string, CommonOpponentTeam>,
): CommonOpponentsBreakdown | null {
  const sport = sportForMatchup(away.abbrev, home.abbrev, teamsByKey)
  if (!sport) return null
  return commonOpponentsForGame(
    { sport, kickoff, cbsEventId, away, home },
    teamsByKey,
  )
}
