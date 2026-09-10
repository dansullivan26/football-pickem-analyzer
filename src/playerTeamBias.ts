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
