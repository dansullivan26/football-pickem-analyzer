import { weekSeason } from './careerHistory.ts'
import type { PlayerHistory } from './types.ts'

export type TeamBiasDirection = 'take' | 'fade'
export type TeamBiasWarmth = 'early' | 'signs' | 'growing' | 'established'

export type TeamBiasSignal = {
  key: string
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  direction: TeamBiasDirection
  warmth: TeamBiasWarmth
  takes: number
  appearances: number
  rate: number
  seasonTakes: number
  seasonAppearances: number
}

export type PlayerTeamBiasSummary = {
  takes: TeamBiasSignal[]
  fades: TeamBiasSignal[]
  seasons: number[]
}

type TeamCount = {
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  takes: number
  appearances: number
}

const MIN_APPEARANCES = 2
const MIN_DIRECTIONAL_RATE = 0.75

export const TEAM_BIAS_WARMTH_LABELS: Record<TeamBiasWarmth, string> = {
  early: 'Early read',
  signs: 'Showing signs',
  growing: 'Pattern growing',
  established: 'Established pattern',
}

export function teamBiasWarmth(
  appearances: number,
  directionalRate: number,
): TeamBiasWarmth {
  if (appearances >= 12 && directionalRate >= 0.85) return 'established'
  if (appearances >= 7 && directionalRate >= 0.8) return 'growing'
  if (appearances >= 4 && directionalRate >= 0.75) return 'signs'
  return 'early'
}

function addAppearance(
  counts: Map<string, TeamCount>,
  sport: 'NFL' | 'NCAAF',
  abbrev: string,
  taken: boolean,
) {
  const key = `${sport}:${abbrev}`
  const current = counts.get(key) ?? {
    sport,
    abbrev,
    takes: 0,
    appearances: 0,
  }
  current.appearances += 1
  if (taken) current.takes += 1
  counts.set(key, current)
}

function countsForPlayer(
  entryId: string,
  history: PlayerHistory,
  seasonYear?: number,
) {
  const counts = new Map<string, TeamCount>()
  for (const week of history.weeks) {
    if (
      seasonYear != null &&
      weekSeason(week, history.pool.seasonYear) !== seasonYear
    ) {
      continue
    }
    const picks =
      week.entries.find((entry) => entry.entryId === entryId)?.picks ?? []
    for (const pick of picks) {
      if (pick.pickedSide !== 'home' && pick.pickedSide !== 'away') continue
      addAppearance(
        counts,
        pick.sport,
        pick.away,
        pick.pickedSide === 'away',
      )
      addAppearance(
        counts,
        pick.sport,
        pick.home,
        pick.pickedSide === 'home',
      )
    }
  }
  return counts
}

function compareSignals(left: TeamBiasSignal, right: TeamBiasSignal) {
  const warmthRank: Record<TeamBiasWarmth, number> = {
    established: 3,
    growing: 2,
    signs: 1,
    early: 0,
  }
  return (
    warmthRank[right.warmth] - warmthRank[left.warmth] ||
    right.appearances - left.appearances ||
    Math.abs(right.rate - 0.5) - Math.abs(left.rate - 0.5) ||
    left.abbrev.localeCompare(right.abbrev)
  )
}

export function summarizePlayerTeamBias(
  entryId: string,
  history: PlayerHistory,
  currentSeason = history.pool.seasonYear,
): PlayerTeamBiasSummary {
  const career = countsForPlayer(entryId, history)
  const season = countsForPlayer(entryId, history, currentSeason)
  const signals: TeamBiasSignal[] = []

  for (const [key, count] of career) {
    if (count.appearances < MIN_APPEARANCES) continue
    const rate = count.takes / count.appearances
    const directionalRate = Math.max(rate, 1 - rate)
    if (directionalRate < MIN_DIRECTIONAL_RATE) continue
    const direction: TeamBiasDirection = rate >= 0.5 ? 'take' : 'fade'
    const current = season.get(key)
    signals.push({
      key,
      sport: count.sport,
      abbrev: count.abbrev,
      direction,
      warmth: teamBiasWarmth(count.appearances, directionalRate),
      takes: count.takes,
      appearances: count.appearances,
      rate: direction === 'take' ? rate : 1 - rate,
      seasonTakes: current?.takes ?? 0,
      seasonAppearances: current?.appearances ?? 0,
    })
  }

  const seasons = [
    ...new Set(
      history.weeks.map((week) =>
        weekSeason(week, history.pool.seasonYear),
      ),
    ),
  ].sort((left, right) => left - right)

  return {
    takes: signals
      .filter((signal) => signal.direction === 'take')
      .sort(compareSignals)
      .slice(0, 3),
    fades: signals
      .filter((signal) => signal.direction === 'fade')
      .sort(compareSignals)
      .slice(0, 3),
    seasons,
  }
}

export function teamBiasSentence(
  signal: TeamBiasSignal,
  teamName: string,
) {
  const action =
    signal.direction === 'take' ? `taking ${teamName}` : `fading ${teamName}`
  if (signal.warmth === 'established') {
    return signal.direction === 'take'
      ? `Appears to consistently take ${teamName}.`
      : `Appears to consistently pick against ${teamName}.`
  }
  if (signal.warmth === 'growing') return `Confidence is growing in a pattern of ${action}.`
  if (signal.warmth === 'signs') return `Showing signs of ${action}.`
  return `Early read toward ${action}.`
}

export const POOL_TEAM_BIAS_MIN_GAMES = 2
export const POOL_TEAM_BIAS_LIST_SIZE = 6

export type PoolTeamBiasSignal = {
  key: string
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  direction: TeamBiasDirection
  takes: number
  appearances: number
  games: number
  rate: number
  favoriteTakes: number
  favoriteAppearances: number
  dogTakes: number
  dogAppearances: number
}

export type PoolTeamBiasSummary = {
  takes: PoolTeamBiasSignal[]
  fades: PoolTeamBiasSignal[]
}

type PoolTeamCount = TeamCount & {
  events: Set<number>
  favoriteTakes: number
  favoriteAppearances: number
  dogTakes: number
  dogAppearances: number
}

function spreadRole(
  homeSpread: number,
  side: 'home' | 'away',
): 'favorite' | 'dog' | 'pickem' {
  if (homeSpread === 0) return 'pickem'
  const homeFavorite = homeSpread < 0
  if (side === 'home') return homeFavorite ? 'favorite' : 'dog'
  return homeFavorite ? 'dog' : 'favorite'
}

function emptyPoolCount(
  sport: 'NFL' | 'NCAAF',
  abbrev: string,
): PoolTeamCount {
  return {
    sport,
    abbrev,
    takes: 0,
    appearances: 0,
    events: new Set(),
    favoriteTakes: 0,
    favoriteAppearances: 0,
    dogTakes: 0,
    dogAppearances: 0,
  }
}

function addPoolAppearance(
  counts: Map<string, PoolTeamCount>,
  sport: 'NFL' | 'NCAAF',
  abbrev: string,
  cbsEventId: number,
  taken: boolean,
  role: 'favorite' | 'dog' | 'pickem',
) {
  const key = `${sport}:${abbrev}`
  const current = counts.get(key) ?? emptyPoolCount(sport, abbrev)
  current.appearances += 1
  if (taken) current.takes += 1
  current.events.add(cbsEventId)
  if (role === 'favorite') {
    current.favoriteAppearances += 1
    if (taken) current.favoriteTakes += 1
  } else if (role === 'dog') {
    current.dogAppearances += 1
    if (taken) current.dogTakes += 1
  }
  counts.set(key, current)
}

function comparePoolSignals(
  left: PoolTeamBiasSignal,
  right: PoolTeamBiasSignal,
) {
  return (
    right.rate - left.rate ||
    right.games - left.games ||
    right.appearances - left.appearances ||
    left.abbrev.localeCompare(right.abbrev)
  )
}

function toPoolSignal(
  key: string,
  count: PoolTeamCount,
): PoolTeamBiasSignal | null {
  if (count.events.size < POOL_TEAM_BIAS_MIN_GAMES || count.appearances === 0) {
    return null
  }
  const takeRate = count.takes / count.appearances
  if (takeRate === 0.5) return null
  const direction: TeamBiasDirection = takeRate > 0.5 ? 'take' : 'fade'
  return {
    key,
    sport: count.sport,
    abbrev: count.abbrev,
    direction,
    takes: count.takes,
    appearances: count.appearances,
    games: count.events.size,
    rate: direction === 'take' ? takeRate : 1 - takeRate,
    favoriteTakes: count.favoriteTakes,
    favoriteAppearances: count.favoriteAppearances,
    dogTakes: count.dogTakes,
    dogAppearances: count.dogAppearances,
  }
}

/** Ranked clubs this pool takes or fades, after at least two distinct games. */
export function summarizePoolTeamBias(
  history: PlayerHistory,
  seasonYear = history.pool.seasonYear,
  limit = POOL_TEAM_BIAS_LIST_SIZE,
): PoolTeamBiasSummary {
  const counts = new Map<string, PoolTeamCount>()
  for (const week of history.weeks) {
    if (weekSeason(week, history.pool.seasonYear) !== seasonYear) continue
    for (const entry of week.entries) {
      for (const pick of entry.picks) {
        if (pick.pickedSide !== 'home' && pick.pickedSide !== 'away') continue
        addPoolAppearance(
          counts,
          pick.sport,
          pick.away,
          pick.cbsEventId,
          pick.pickedSide === 'away',
          spreadRole(pick.homeSpread, 'away'),
        )
        addPoolAppearance(
          counts,
          pick.sport,
          pick.home,
          pick.cbsEventId,
          pick.pickedSide === 'home',
          spreadRole(pick.homeSpread, 'home'),
        )
      }
    }
  }

  const signals: PoolTeamBiasSignal[] = []
  for (const [key, count] of counts) {
    const signal = toPoolSignal(key, count)
    if (signal) signals.push(signal)
  }

  return {
    takes: signals
      .filter((signal) => signal.direction === 'take')
      .sort(comparePoolSignals)
      .slice(0, limit),
    fades: signals
      .filter((signal) => signal.direction === 'fade')
      .sort(comparePoolSignals)
      .slice(0, limit),
  }
}

export function poolTeamBiasSentence(
  signal: PoolTeamBiasSignal,
  teamName: string,
) {
  const pct = Math.round(signal.rate * 100)
  const games = `${signal.games} game${signal.games === 1 ? '' : 's'}`
  return signal.direction === 'take'
    ? `The pool took ${teamName} on ${pct}% of submitted cards (${games}).`
    : `The pool faded ${teamName} on ${pct}% of submitted cards (${games}).`
}

export function poolTeamBiasRoleLine(signal: PoolTeamBiasSignal) {
  const parts: string[] = []
  if (signal.favoriteAppearances > 0) {
    parts.push(
      `as favorite ${signal.favoriteTakes} of ${signal.favoriteAppearances}`,
    )
  }
  if (signal.dogAppearances > 0) {
    parts.push(`as dog ${signal.dogTakes} of ${signal.dogAppearances}`)
  }
  return parts.join(' · ')
}
