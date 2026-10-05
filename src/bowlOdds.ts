import {
  emptyBowlPickem,
  emptyBowlSide,
  filesEqualForWrite,
  type BowlGame,
  type BowlPickemFile,
  type BowlSide,
} from './bowlPickem.ts'
import { normalizeScheduleName } from './lastKickoff.ts'

/** First bowls through the CFP championship, skipping conference title weekend. */
export const BOWL_WINDOW_START_MONTH = 12
export const BOWL_WINDOW_START_DAY = 16
export const BOWL_WINDOW_END_MONTH = 1
export const BOWL_WINDOW_END_DAY = 21

export type BowlBookRow = {
  event_id?: string | number
  event_start_time?: string
  home_team?: string
  away_team?: string
  league?: string
  line?: number
  sportsbook?: string
  team_side?: string
  selection?: string
  is_main_line?: boolean
  odds_american?: number
  market_type?: string
  is_live?: boolean
  is_active?: boolean
  is_alternate_line?: boolean
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function isBowlWindowKickoff(iso: string, seasonYear: number) {
  const stamp = Date.parse(iso)
  if (!Number.isFinite(stamp)) return false
  const start = Date.UTC(
    seasonYear,
    BOWL_WINDOW_START_MONTH - 1,
    BOWL_WINDOW_START_DAY,
  )
  const end = Date.UTC(
    seasonYear + 1,
    BOWL_WINDOW_END_MONTH - 1,
    BOWL_WINDOW_END_DAY + 1,
  )
  return stamp >= start && stamp < end
}

function rowRank(row: BowlBookRow) {
  return {
    main: row.is_main_line === true ? 1 : 0,
    balance: Math.abs((row.odds_american ?? -110) + 110),
  }
}

function outranks(
  candidate: ReturnType<typeof rowRank>,
  current: ReturnType<typeof rowRank>,
) {
  if (candidate.main !== current.main) return candidate.main > current.main
  return candidate.balance < current.balance
}

export function usableBowlSpread(row: BowlBookRow) {
  if (row.sportsbook && row.sportsbook !== 'draftkings') return false
  if (row.market_type && row.market_type !== 'point_spread') return false
  if (typeof row.line !== 'number') return false
  if (row.is_live === true) return false
  if (row.is_active === false) return false
  if (row.is_alternate_line === true) return false
  return true
}

function namesMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeScheduleName(left)
  const b = normalizeScheduleName(right)
  return Boolean(a) && a === b
}

export function homeSpreadFromRow(row: BowlBookRow) {
  if (typeof row.line !== 'number') return null
  if (row.selection) {
    if (namesMatch(row.selection, row.home_team)) return row.line
    if (namesMatch(row.selection, row.away_team)) return -row.line
  }
  if (row.team_side === 'home') return row.line
  if (row.team_side === 'away') return -row.line
  return null
}

function providerEventId(row: BowlBookRow) {
  if (row.event_id == null || row.event_id === '') return null
  return String(row.event_id)
}

export function bowlGameId(row: {
  providerEventId?: string | null
  away: string
  home: string
  kickoff: string | null
}) {
  if (row.providerEventId) return `dk-${row.providerEventId}`
  const away = normalizeScheduleName(row.away).replace(/\s+/g, '-')
  const home = normalizeScheduleName(row.home).replace(/\s+/g, '-')
  const day = row.kickoff?.slice(0, 10) || 'undated'
  return `bowl-${away}-at-${home}-${day}`
}

function keepSide(previous: BowlSide | undefined, name: string): BowlSide {
  const next = emptyBowlSide(name)
  if (!previous) return next
  if (normalizeScheduleName(previous.name) !== normalizeScheduleName(name)) {
    return next
  }
  return {
    name,
    abbrev: previous.abbrev,
    teamId: previous.teamId,
  }
}

type RankedSpread = {
  row: BowlBookRow
  homeSpread: number
  rank: ReturnType<typeof rowRank>
}

export function bowlGamesFromBookRows(
  rows: BowlBookRow[],
  seasonYear: number,
): BowlGame[] {
  const best = new Map<string, RankedSpread>()

  for (const row of rows) {
    if (!usableBowlSpread(row)) continue
    const kickoff = text(row.event_start_time)
    if (!kickoff || !isBowlWindowKickoff(kickoff, seasonYear)) continue
    const away = text(row.away_team)
    const home = text(row.home_team)
    if (!away || !home) continue
    const homeSpread = homeSpreadFromRow(row)
    if (homeSpread == null) continue

    const providerId = providerEventId(row)
    const key =
      providerId ??
      bowlGameId({ providerEventId: null, away, home, kickoff })
    const rank = rowRank(row)
    const previous = best.get(key)
    if (!previous || outranks(rank, previous.rank)) {
      best.set(key, { row, homeSpread, rank })
    }
  }

  return [...best.values()]
    .map(({ row, homeSpread }) => {
      const kickoff = text(row.event_start_time)
      const away = text(row.away_team) ?? 'Away'
      const home = text(row.home_team) ?? 'Home'
      const providerId = providerEventId(row)
      return {
        id: bowlGameId({
          providerEventId: providerId,
          away,
          home,
          kickoff,
        }),
        providerEventId: providerId,
        bowlName: null,
        kickoff,
        away: emptyBowlSide(away),
        home: emptyBowlSide(home),
        homeSpread,
        spreadUpdatedAt: null,
      } satisfies BowlGame
    })
    .sort((left, right) =>
      (left.kickoff ?? '').localeCompare(right.kickoff ?? ''),
    )
}

function sameGame(left: BowlGame, right: BowlGame) {
  if (left.providerEventId && left.providerEventId === right.providerEventId) {
    return true
  }
  if (left.id === right.id) return true
  const sidesMatch =
    namesMatch(left.away.name, right.away.name) &&
    namesMatch(left.home.name, right.home.name)
  const swapped =
    namesMatch(left.away.name, right.home.name) &&
    namesMatch(left.home.name, right.away.name)
  if (!sidesMatch && !swapped) return false
  if (!left.kickoff || !right.kickoff) return true
  return Math.abs(Date.parse(left.kickoff) - Date.parse(right.kickoff)) <= 36 * 60 * 60 * 1000
}

function mergeGame(previous: BowlGame | undefined, incoming: BowlGame, runAt: string): BowlGame {
  if (!previous) {
    return { ...incoming, spreadUpdatedAt: incoming.homeSpread == null ? null : runAt }
  }
  const spreadChanged =
    previous.homeSpread !== incoming.homeSpread && incoming.homeSpread != null
  return {
    id: previous.id || incoming.id,
    providerEventId: incoming.providerEventId ?? previous.providerEventId,
    bowlName: previous.bowlName ?? incoming.bowlName,
    location: incoming.location ?? previous.location ?? null,
    timeLabel: incoming.timeLabel ?? previous.timeLabel ?? null,
    kickoff: incoming.kickoff ?? previous.kickoff,
    away: keepSide(previous.away, incoming.away.name),
    home: keepSide(previous.home, incoming.home.name),
    homeSpread: incoming.homeSpread ?? previous.homeSpread,
    spreadUpdatedAt: spreadChanged
      ? runAt
      : previous.spreadUpdatedAt,
  }
}

export function mergeBowlOdds(options: {
  previous: BowlPickemFile | null | undefined
  seasonYear: number
  games: BowlGame[]
  runAt: string
}): { file: BowlPickemFile; changed: boolean } {
  const previous =
    options.previous && options.previous.seasonYear === options.seasonYear
      ? options.previous
      : emptyBowlPickem(options.seasonYear)

  const kept = previous.games.filter(
    (game) => !game.kickoff || isBowlWindowKickoff(game.kickoff, options.seasonYear),
  )
  const nextGames: BowlGame[] = []

  for (const incoming of options.games) {
    const match = kept.find((game) => sameGame(game, incoming))
    nextGames.push(mergeGame(match, incoming, options.runAt))
  }

  for (const leftover of kept) {
    if (!nextGames.some((game) => sameGame(game, leftover))) {
      nextGames.push(leftover)
    }
  }

  nextGames.sort((left, right) =>
    (left.kickoff ?? '').localeCompare(right.kickoff ?? '') ||
    left.id.localeCompare(right.id),
  )

  const status =
    previous.status === 'final'
      ? 'final'
      : nextGames.length > 0
        ? 'open'
        : 'awaiting-matchups'

  const oddsMoved = nextGames.some((game, index) => {
    const prior = previous.games.find((row) => sameGame(row, game)) ?? previous.games[index]
    return prior?.homeSpread !== game.homeSpread
  })

  const file: BowlPickemFile = {
    ...previous,
    seasonYear: options.seasonYear,
    status,
    games: nextGames,
    oddsUpdatedAt: oddsMoved
      ? options.runAt
      : nextGames.length && !previous.oddsUpdatedAt
        ? options.runAt
        : previous.oddsUpdatedAt,
    updatedAt:
      nextGames.length !== previous.games.length || status !== previous.status
        ? options.runAt
        : previous.updatedAt,
  }

  return { file, changed: !filesEqualForWrite(previous, file) }
}

export type CfbdBowlGame = {
  homeTeam?: string
  awayTeam?: string
  home_team?: string
  away_team?: string
  startDate?: string
  start_date?: string
  notes?: string | null
  seasonType?: string
  season_type?: string
}

function cfbdTeam(game: CfbdBowlGame, side: 'home' | 'away') {
  if (side === 'home') return text(game.homeTeam) ?? text(game.home_team)
  return text(game.awayTeam) ?? text(game.away_team)
}

export function applyCfbdBowlNames(games: BowlGame[], cfbdGames: CfbdBowlGame[]) {
  return games.map((game) => {
    if (game.bowlName) return game
    const match = cfbdGames.find((row) => {
      const seasonType = text(row.seasonType) ?? text(row.season_type)
      if (seasonType && seasonType.toLowerCase() !== 'postseason') return false
      const away = cfbdTeam(row, 'away')
      const home = cfbdTeam(row, 'home')
      if (!away || !home) return false
      const sides =
        (namesMatch(game.away.name, away) && namesMatch(game.home.name, home)) ||
        (namesMatch(game.away.name, home) && namesMatch(game.home.name, away))
      if (!sides) return false
      const kickoff = text(row.startDate) ?? text(row.start_date)
      if (!game.kickoff || !kickoff) return true
      return Math.abs(Date.parse(game.kickoff) - Date.parse(kickoff)) <= 36 * 60 * 60 * 1000
    })
    const notes = text(match?.notes)
    if (!notes) return game
    return { ...game, bowlName: notes }
  })
}
