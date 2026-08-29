import type {
  CoverResult,
  FrozenRecommendation,
  RecommendationHistory,
  Slate,
  Team,
} from './types'

export type CoverOutcome = 'win' | 'loss' | 'push' | null
export type TeamVenue = 'home' | 'away'
export type TeamMarket = 'favorite' | 'dog' | 'pickem'

export type TeamAppearance = {
  week: number
  weekLabel: string
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  opponent: string
  venue: TeamVenue
  market: TeamMarket
  homeSpread: number
  result: CoverOutcome
}

export type TeamSplit = {
  games: number
  wins: number
  losses: number
  pushes: number
  pending: number
  rate: string
  detail: string
}

export type TeamRecord = {
  key: string
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  name: string
  conference: string | null
  teamId: string | null
  appearances: TeamAppearance[]
  overall: TeamSplit
  home: TeamSplit
  away: TeamSplit
  favorite: TeamSplit
  dog: TeamSplit
}

export type TeamDirectory = {
  teams: TeamRecord[]
  home: TeamSplit
  away: TeamSplit
  favorite: TeamSplit
  dog: TeamSplit
}

export function teamKey(sport: 'NFL' | 'NCAAF', abbrev: string) {
  return `${sport}:${abbrev}`
}

export function marketForSide(
  side: 'home' | 'away',
  homeSpread: number,
): TeamMarket {
  if (homeSpread === 0) return 'pickem'
  const favoriteSide = homeSpread < 0 ? 'home' : 'away'
  return side === favoriteSide ? 'favorite' : 'dog'
}

export function resultForSide(
  side: 'home' | 'away',
  cover: CoverResult,
): CoverOutcome {
  if (!cover) return null
  if (cover === 'push') return 'push'
  return cover === side ? 'win' : 'loss'
}

function formatRate(wins: number, losses: number) {
  const decided = wins + losses
  if (!decided) return '—'
  return `${Math.round((wins / decided) * 100)}%`
}

export function summarizeAppearances(
  appearances: TeamAppearance[],
  match: (row: TeamAppearance) => boolean = () => true,
): TeamSplit {
  const rows = appearances.filter(match)
  const wins = rows.filter((row) => row.result === 'win').length
  const losses = rows.filter((row) => row.result === 'loss').length
  const pushes = rows.filter((row) => row.result === 'push').length
  const pending = rows.filter((row) => row.result == null).length
  return {
    games: rows.length,
    wins,
    losses,
    pushes,
    pending,
    rate: formatRate(wins, losses),
    detail: `${wins}-${losses}${pushes ? `-${pushes}` : ''} ATS`,
  }
}

type RosterEntry = {
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  name: string
  conference: string | null
  teamId: string | null
}

function rosterFromSlate(slate: Slate) {
  const roster = new Map<string, RosterEntry>()
  for (const game of slate.games) {
    for (const side of [game.away, game.home] as Team[]) {
      roster.set(teamKey(game.sport, side.abbrev), {
        sport: game.sport,
        abbrev: side.abbrev,
        name: side.name,
        conference: side.conference || null,
        teamId: side.id,
      })
    }
  }
  return roster
}

function addAppearance(
  groups: Map<string, { info: RosterEntry; appearances: TeamAppearance[] }>,
  roster: Map<string, RosterEntry>,
  info: RosterEntry,
  appearance: TeamAppearance,
) {
  const key = teamKey(info.sport, info.abbrev)
  const existing = groups.get(key)
  if (existing) {
    existing.appearances.push(appearance)
    if (!existing.info.teamId && info.teamId) existing.info = info
    return
  }
  groups.set(key, {
    info: roster.get(key) ?? info,
    appearances: [appearance],
  })
}

export function buildTeamDirectory(
  slate: Slate,
  history: RecommendationHistory,
): TeamDirectory {
  const roster = rosterFromSlate(slate)
  const groups = new Map<string, { info: RosterEntry; appearances: TeamAppearance[] }>()

  for (const info of roster.values()) {
    groups.set(teamKey(info.sport, info.abbrev), { info, appearances: [] })
  }

  for (const week of history.weeks) {
    for (const game of week.games) {
      const sides: Array<{
        abbrev: string
        venue: TeamVenue
      }> = [
        { abbrev: game.away, venue: 'away' },
        { abbrev: game.home, venue: 'home' },
      ]
      for (const { abbrev, venue } of sides) {
        addAppearance(
          groups,
          roster,
          {
            sport: game.sport,
            abbrev,
            name: roster.get(teamKey(game.sport, abbrev))?.name ?? abbrev,
            conference:
              roster.get(teamKey(game.sport, abbrev))?.conference ?? null,
            teamId: roster.get(teamKey(game.sport, abbrev))?.teamId ?? null,
          },
          {
            week: week.week,
            weekLabel: week.label,
            cbsEventId: game.cbsEventId,
            sport: game.sport,
            opponent: venue === 'home' ? game.away : game.home,
            venue,
            market: marketForSide(venue, game.homeSpread),
            homeSpread: game.homeSpread,
            result: resultForSide(venue, game.cover),
          },
        )
      }
    }
  }

  const teams = [...groups.values()]
    .map(({ info, appearances }) => {
      const ordered = [...appearances].sort(
        (left, right) =>
          left.week - right.week || left.cbsEventId - right.cbsEventId,
      )
      return {
        key: teamKey(info.sport, info.abbrev),
        sport: info.sport,
        abbrev: info.abbrev,
        name: info.name,
        conference: info.conference,
        teamId: info.teamId,
        appearances: ordered,
        overall: summarizeAppearances(ordered),
        home: summarizeAppearances(ordered, (row) => row.venue === 'home'),
        away: summarizeAppearances(ordered, (row) => row.venue === 'away'),
        favorite: summarizeAppearances(
          ordered,
          (row) => row.market === 'favorite',
        ),
        dog: summarizeAppearances(ordered, (row) => row.market === 'dog'),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  const all = teams.flatMap((team) => team.appearances)
  return {
    teams,
    home: summarizeAppearances(all, (row) => row.venue === 'home'),
    away: summarizeAppearances(all, (row) => row.venue === 'away'),
    favorite: summarizeAppearances(all, (row) => row.market === 'favorite'),
    dog: summarizeAppearances(all, (row) => row.market === 'dog'),
  }
}
