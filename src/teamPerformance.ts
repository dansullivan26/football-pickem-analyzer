import { weeksForSeason } from './careerHistory.ts'
import { cbsTeamRank, frozenRanksCaptured } from './teamRanks.ts'
import { gameScores } from './gameStatus.ts'
import {
  isColdTemp,
  isHotTemp,
  type FrozenWeather,
  type WeatherHistoryFile,
} from './weatherBuckets.ts'
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
  kickoff: string
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  opponent: string
  venue: TeamVenue
  market: TeamMarket
  homeSpread: number
  result: CoverOutcome
  awayScore: number | null
  homeScore: number | null
  weather: FrozenWeather | null
  /** This team's CBS rank that week. Undefined if we never stamped the rec. */
  rank?: number | null
  opponentRank?: number | null
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
  slug: string
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  name: string
  location: string | null
  nickname: string | null
  conference: string | null
  teamId: string | null
  rank: number | null
  appearances: TeamAppearance[]
  overall: TeamSplit
  home: TeamSplit
  away: TeamSplit
  favorite: TeamSplit
  dog: TeamSplit
  benign: TeamSplit
  adverse: TeamSplit
  wet: TeamSplit
  windy: TeamSplit
  hot: TeamSplit
  cold: TeamSplit
  indoor: TeamSplit
}

export type TeamDirectory = {
  teams: TeamRecord[]
  home: TeamSplit
  away: TeamSplit
  favorite: TeamSplit
  dog: TeamSplit
  benign: TeamSplit
  adverse: TeamSplit
  wet: TeamSplit
  windy: TeamSplit
  hot: TeamSplit
  cold: TeamSplit
  indoor: TeamSplit
}

export function teamKey(sport: 'NFL' | 'NCAAF', abbrev: string) {
  return `${sport}:${abbrev}`
}

export function formatRankedTeamName(
  name: string,
  rank: number | null | undefined,
) {
  return typeof rank === 'number' ? `#${rank} ${name}` : name
}

export function teamSlug(name: string) {
  return name
    .replace(/['’.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function assignTeamSlugs(
  teams: Array<{ name: string; sport: string; abbrev: string }>,
) {
  const bases = teams.map((team) => teamSlug(team.name))
  const counts = new Map<string, number>()
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1)

  const slugs = teams.map((team, index) => {
    const base = bases[index] ?? teamSlug(team.abbrev)
    return (counts.get(base) ?? 0) > 1
      ? `${base}-${team.sport.toLowerCase()}`
      : base
  })

  const used = new Map<string, number>()
  return slugs.map((slug, index) => {
    const seen = used.get(slug) ?? 0
    used.set(slug, seen + 1)
    if (seen === 0) return slug
    return `${slug}-${teamSlug(teams[index]?.abbrev ?? String(seen + 1))}`
  })
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

function appearanceRanks(
  frozen: FrozenRecommendation,
  venue: TeamVenue,
  live?: Pick<Slate['games'][number], 'away' | 'home'>,
) {
  const captured = frozenRanksCaptured(frozen)
  const awayRank = captured
    ? (frozen.awayRank ?? null)
    : live
      ? cbsTeamRank(live.away)
      : undefined
  const homeRank = captured
    ? (frozen.homeRank ?? null)
    : live
      ? cbsTeamRank(live.home)
      : undefined
  if (awayRank === undefined && homeRank === undefined) return {}
  return {
    rank: venue === 'home' ? homeRank ?? null : awayRank ?? null,
    opponentRank: venue === 'home' ? awayRank ?? null : homeRank ?? null,
  }
}

function appearanceScores(
  frozen: FrozenRecommendation,
  live?: Pick<Slate['games'][number], 'awayScore' | 'homeScore'>,
) {
  const scores = gameScores(live ?? {}) ?? gameScores(frozen)
  return {
    awayScore: scores?.away ?? null,
    homeScore: scores?.home ?? null,
  }
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
  location: string | null
  nickname: string | null
  conference: string | null
  teamId: string | null
  rank: number | null
}

function rosterFromSlate(slate: Slate) {
  const roster = new Map<string, RosterEntry>()
  for (const game of slate.games) {
    for (const side of [game.away, game.home] as Team[]) {
      roster.set(teamKey(game.sport, side.abbrev), {
        sport: game.sport,
        abbrev: side.abbrev,
        name: side.name,
        location: side.location || null,
        nickname: side.nickname || null,
        conference: side.conference || null,
        teamId: side.id,
        rank: typeof side.rank === 'number' ? side.rank : null,
      })
    }
  }
  return roster
}

function rosterName(
  roster: Map<string, RosterEntry>,
  sport: 'NFL' | 'NCAAF',
  abbrev: string,
) {
  return roster.get(teamKey(sport, abbrev))?.name ?? abbrev
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
    existing.info = {
      ...existing.info,
      name: existing.info.name || info.name,
      location: existing.info.location ?? info.location,
      nickname: existing.info.nickname ?? info.nickname,
      conference: existing.info.conference ?? info.conference,
      teamId: existing.info.teamId ?? info.teamId,
      rank: existing.info.rank ?? info.rank,
    }
    return
  }
  groups.set(key, {
    info: roster.get(key) ?? info,
    appearances: [appearance],
  })
}

function weatherSplits(appearances: TeamAppearance[]) {
  return {
    benign: summarizeAppearances(
      appearances,
      (row) => row.weather?.bucket === 'benign',
    ),
    adverse: summarizeAppearances(
      appearances,
      (row) => row.weather?.bucket === 'adverse',
    ),
    wet: summarizeAppearances(appearances, (row) => row.weather?.wet === true),
    windy: summarizeAppearances(
      appearances,
      (row) => row.weather?.windy === true,
    ),
    hot: summarizeAppearances(appearances, (row) =>
      isHotTemp(row.weather?.temperature),
    ),
    cold: summarizeAppearances(appearances, (row) =>
      isColdTemp(row.weather?.temperature),
    ),
    indoor: summarizeAppearances(
      appearances,
      (row) => row.weather?.bucket === 'indoor',
    ),
  }
}

export function buildTeamDirectory(
  slate: Slate,
  history: RecommendationHistory,
  weatherHistory: WeatherHistoryFile = { updatedAt: null, games: [] },
): TeamDirectory {
  const roster = rosterFromSlate(slate)
  const groups = new Map<string, { info: RosterEntry; appearances: TeamAppearance[] }>()

  for (const info of roster.values()) {
    groups.set(teamKey(info.sport, info.abbrev), { info, appearances: [] })
  }

  const slateByEvent = new Map(
    slate.games.map((game) => [game.cbsEventId, game]),
  )
  const weatherByEvent = new Map(
    weatherHistory.games
      .filter((game) => game.seasonYear === slate.pool.seasonYear)
      .map((game) => [game.cbsEventId, game]),
  )
  const seasonWeeks = weeksForSeason(history.weeks, slate.pool.seasonYear)
  for (const week of seasonWeeks) {
    for (const game of week.games) {
      const sides: Array<{
        abbrev: string
        venue: TeamVenue
      }> = [
        { abbrev: game.away, venue: 'away' },
        { abbrev: game.home, venue: 'home' },
      ]
      for (const { abbrev, venue } of sides) {
        const opponentAbbrev = venue === 'home' ? game.away : game.home
        addAppearance(
          groups,
          roster,
          {
            sport: game.sport,
            abbrev,
            name: rosterName(roster, game.sport, abbrev),
            location:
              roster.get(teamKey(game.sport, abbrev))?.location ?? null,
            nickname:
              roster.get(teamKey(game.sport, abbrev))?.nickname ?? null,
            conference:
              roster.get(teamKey(game.sport, abbrev))?.conference ?? null,
            teamId: roster.get(teamKey(game.sport, abbrev))?.teamId ?? null,
            rank: roster.get(teamKey(game.sport, abbrev))?.rank ?? null,
          },
          {
            week: week.week,
            weekLabel: week.label,
            kickoff: game.kickoff,
            cbsEventId: game.cbsEventId,
            sport: game.sport,
            opponent: rosterName(roster, game.sport, opponentAbbrev),
            venue,
            market: marketForSide(venue, game.homeSpread),
            homeSpread: game.homeSpread,
            result: resultForSide(venue, game.cover),
            ...appearanceScores(game, slateByEvent.get(game.cbsEventId)),
            weather: weatherByEvent.get(game.cbsEventId) ?? null,
            ...appearanceRanks(game, venue, slateByEvent.get(game.cbsEventId)),
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
        location: info.location,
        nickname: info.nickname,
        conference: info.conference,
        teamId: info.teamId,
        rank: info.rank,
        appearances: ordered,
        overall: summarizeAppearances(ordered),
        home: summarizeAppearances(ordered, (row) => row.venue === 'home'),
        away: summarizeAppearances(ordered, (row) => row.venue === 'away'),
        favorite: summarizeAppearances(
          ordered,
          (row) => row.market === 'favorite',
        ),
        dog: summarizeAppearances(ordered, (row) => row.market === 'dog'),
        ...weatherSplits(ordered),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  const slugs = assignTeamSlugs(teams)
  const teamsWithSlugs = teams.map((team, index) => ({
    ...team,
    slug: slugs[index] ?? teamSlug(team.name),
  }))

  const all = teamsWithSlugs.flatMap((team) => team.appearances)
  return {
    teams: teamsWithSlugs,
    home: summarizeAppearances(all, (row) => row.venue === 'home'),
    away: summarizeAppearances(all, (row) => row.venue === 'away'),
    favorite: summarizeAppearances(all, (row) => row.market === 'favorite'),
    dog: summarizeAppearances(all, (row) => row.market === 'dog'),
    ...weatherSplits(all),
  }
}

/** Same slugs Teams uses, keyed by `sport:abbrev`. */
export function teamPageSlugs(
  slate: Slate,
  history: RecommendationHistory,
): Map<string, string> {
  return new Map(
    buildTeamDirectory(slate, history).teams.map((team) => [team.key, team.slug]),
  )
}
