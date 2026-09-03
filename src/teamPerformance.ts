import { weeksForSeason } from './careerHistory.ts'
import { cbsTeamRank, frozenRanksCaptured } from './teamRanks.ts'
import {
  classifyGameSites,
  collectHomeVenues,
  type CbsSide,
  type TeamSite,
} from './teamSite.ts'
import {
  buildTravelRestIndex,
  restSplitKey,
  travelSplitKey,
} from './travelRest.ts'
import type { SideRest, SideTravel } from './travelRest.ts'
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
export type TeamVenue = TeamSite
export type TeamMarket = 'favorite' | 'dog' | 'pickem'

export type TeamAppearance = {
  week: number
  weekLabel: string
  kickoff: string
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  opponent: string
  /** CBS home/away designation — the line, not the site. */
  side: CbsSide
  /** Actual site: campus home, road, or a third-city / abroad neutral. */
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
  travel: SideTravel | null
  rest: SideRest | null
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
  neutral: TeamSplit
  favorite: TeamSplit
  dog: TeamSplit
  dogOutright: TeamSplit
  benign: TeamSplit
  adverse: TeamSplit
  wet: TeamSplit
  windy: TeamSplit
  hot: TeamSplit
  cold: TeamSplit
  indoor: TeamSplit
  oneZone: TeamSplit
  twoZones: TeamSplit
  threePlus: TeamSplit
  shortRest: TeamSplit
  normalRest: TeamSplit
  longRest: TeamSplit
  byeRest: TeamSplit
}

export type TeamDirectory = {
  teams: TeamRecord[]
  home: TeamSplit
  away: TeamSplit
  neutral: TeamSplit
  favorite: TeamSplit
  dog: TeamSplit
  dogOutright: TeamSplit
  benign: TeamSplit
  adverse: TeamSplit
  wet: TeamSplit
  windy: TeamSplit
  hot: TeamSplit
  cold: TeamSplit
  indoor: TeamSplit
  oneZone: TeamSplit
  twoZones: TeamSplit
  threePlus: TeamSplit
  shortRest: TeamSplit
  normalRest: TeamSplit
  longRest: TeamSplit
  byeRest: TeamSplit
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

export type SpreadSize = 'small' | 'medium' | 'big'

/** This side’s plus-number. Positive when they are the dog. */
export function sideSpread(side: 'home' | 'away', homeSpread: number) {
  return side === 'home' ? homeSpread : -homeSpread
}

/**
 * Small ≤3 (a FG), medium 3.5–7 (up to a TD), big 7.5+ (more than a TD).
 * UNC +7.5 is a big dog; TCU -7.5 is a big favorite.
 */
export function spreadSize(points: number): SpreadSize | null {
  const magnitude = Math.abs(points)
  if (magnitude === 0) return null
  if (magnitude <= 3) return 'small'
  if (magnitude <= 7) return 'medium'
  return 'big'
}

export function appearanceMarketLabel(
  row: Pick<TeamAppearance, 'side' | 'market' | 'homeSpread'>,
) {
  if (row.market === 'pickem') return row.market
  const size = spreadSize(sideSpread(row.side, row.homeSpread))
  return size ? `${size} ${row.market}` : row.market
}

export function resultForSide(
  side: 'home' | 'away',
  cover: CoverResult,
): CoverOutcome {
  if (!cover) return null
  if (cover === 'push') return 'push'
  return cover === side ? 'win' : 'loss'
}

export function straightUpResult(
  row: Pick<TeamAppearance, 'side' | 'awayScore' | 'homeScore'>,
): 'win' | 'loss' | 'tie' | null {
  const ours = row.side === 'home' ? row.homeScore : row.awayScore
  const theirs = row.side === 'home' ? row.awayScore : row.homeScore
  if (typeof ours !== 'number' || typeof theirs !== 'number') return null
  if (ours > theirs) return 'win'
  if (ours < theirs) return 'loss'
  return 'tie'
}

export function wonOutrightAsDog(
  row: Pick<TeamAppearance, 'market' | 'side' | 'awayScore' | 'homeScore'>,
) {
  return row.market === 'dog' && straightUpResult(row) === 'win'
}

function appearanceRanks(
  frozen: FrozenRecommendation,
  side: CbsSide,
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
    rank: side === 'home' ? homeRank ?? null : awayRank ?? null,
    opponentRank: side === 'home' ? awayRank ?? null : homeRank ?? null,
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

function summarizeDogOutright(appearances: TeamAppearance[]): TeamSplit {
  const dogs = appearances.filter((row) => row.market === 'dog')
  const wins = dogs.filter((row) => straightUpResult(row) === 'win').length
  const losses = dogs.filter((row) => straightUpResult(row) === 'loss').length
  const pushes = dogs.filter((row) => straightUpResult(row) === 'tie').length
  const pending = dogs.filter((row) => straightUpResult(row) == null).length
  return {
    games: dogs.length,
    wins,
    losses,
    pushes,
    pending,
    rate: formatRate(wins, losses),
    detail: `${wins}-${losses}${pushes ? `-${pushes}` : ''} SU`,
  }
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

function travelRestSplits(appearances: TeamAppearance[]) {
  return {
    oneZone: summarizeAppearances(
      appearances,
      (row) => travelSplitKey(row.travel) === 'oneZone',
    ),
    twoZones: summarizeAppearances(
      appearances,
      (row) => travelSplitKey(row.travel) === 'twoZones',
    ),
    threePlus: summarizeAppearances(
      appearances,
      (row) => travelSplitKey(row.travel) === 'threePlus',
    ),
    shortRest: summarizeAppearances(
      appearances,
      (row) => restSplitKey(row.rest) === 'short',
    ),
    normalRest: summarizeAppearances(
      appearances,
      (row) => restSplitKey(row.rest) === 'normal',
    ),
    longRest: summarizeAppearances(
      appearances,
      (row) => restSplitKey(row.rest) === 'long',
    ),
    byeRest: summarizeAppearances(
      appearances,
      (row) => restSplitKey(row.rest) === 'bye',
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
  const travelRest = buildTravelRestIndex(slate, history)
  const seasonWeeks = weeksForSeason(history.weeks, slate.pool.seasonYear)
  const homeVenues = collectHomeVenues(
    seasonWeeks.flatMap((week) =>
      week.games.map((game) => ({
        sport: game.sport,
        home: game.home,
        venue: game.venue ?? slateByEvent.get(game.cbsEventId)?.venue ?? null,
      })),
    ),
  )
  for (const week of seasonWeeks) {
    for (const game of week.games) {
      const live = slateByEvent.get(game.cbsEventId)
      const awayInfo = roster.get(teamKey(game.sport, game.away))
      const homeInfo = roster.get(teamKey(game.sport, game.home))
      const sites = classifyGameSites(
        game.venue ?? live?.venue ?? null,
        { location: awayInfo?.location, name: awayInfo?.name },
        { location: homeInfo?.location, name: homeInfo?.name },
        homeVenues.get(`${game.sport}:${game.away}`) ?? [],
        homeVenues.get(`${game.sport}:${game.home}`) ?? [],
      )
      const sides: Array<{
        abbrev: string
        side: CbsSide
        site: TeamSite
      }> = [
        { abbrev: game.away, side: 'away', site: sites.away },
        { abbrev: game.home, side: 'home', site: sites.home },
      ]
      for (const { abbrev, side, site } of sides) {
        const opponentAbbrev = side === 'home' ? game.away : game.home
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
            side,
            venue: site,
            market: marketForSide(side, game.homeSpread),
            homeSpread: game.homeSpread,
            result: resultForSide(side, game.cover),
            ...appearanceScores(game, live),
            weather: weatherByEvent.get(game.cbsEventId) ?? null,
            ...appearanceRanks(game, side, live),
            travel:
              travelRest.byAppearance.get(`${game.cbsEventId}:${side}`)
                ?.travel ?? null,
            rest:
              travelRest.byAppearance.get(`${game.cbsEventId}:${side}`)
                ?.rest ?? null,
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
        neutral: summarizeAppearances(
          ordered,
          (row) => row.venue === 'neutral',
        ),
        favorite: summarizeAppearances(
          ordered,
          (row) => row.market === 'favorite',
        ),
        dog: summarizeAppearances(ordered, (row) => row.market === 'dog'),
        dogOutright: summarizeDogOutright(ordered),
        ...weatherSplits(ordered),
        ...travelRestSplits(ordered),
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
    neutral: summarizeAppearances(all, (row) => row.venue === 'neutral'),
    favorite: summarizeAppearances(all, (row) => row.market === 'favorite'),
    dog: summarizeAppearances(all, (row) => row.market === 'dog'),
    dogOutright: summarizeDogOutright(all),
    ...weatherSplits(all),
    ...travelRestSplits(all),
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
