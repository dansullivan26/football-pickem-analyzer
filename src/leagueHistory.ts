import { playerSlug } from './playerDirectory.ts'
import type {
  HistoricalSeason,
  SeasonHistoryFile,
} from './seasonHistory.ts'
import type { PlayerHistory, PlayerWeek, PlayerWeekEntry } from './types.ts'

export type MoneyPacePoint = {
  activeWeek: number
  periodOrder: number
  periodLabel: string
  thirdPlaceScore: number
  leaderScore: number
}

export type WeeklyScoreBenchmark = {
  seasonYear: number
  activeWeek: number
  periodOrder: number
  periodLabel: string
  highScore: number
  thirdScore: number
  medianScore: number
  coHighCount: number
}

export type CurrentStanding = {
  entryId: string
  name: string
  score: number
  rank: number
}

export type ReturningMoneyFinisher = {
  name: string
  slug: string
  finishes: Array<{
    seasonYear: number
    place: number
    score: number
  }>
  current: CurrentStanding | null
}

export type HistoricalMoneyPaceMatch = {
  seasonYear: number
  periodOrder: number
  periodLabel: string
  equivalentRank: number
  thirdPlaceScore: number
  gapToThird: number
  cashers: Array<{
    name: string
    place: number
    checkpointScore: number
    finalScore: number
    gap: number
  }>
}

export type PlayerMoneyPaceComparison = {
  current: CurrentStanding
  activeWeek: number
  currentMoneyLine: number
  gapToCurrentMoneyLine: number
  cashersAtOrBelow: number
  cashersTotal: number
  cashPaceMedian: number
  gapToCashPaceMedian: number
  seasons: HistoricalMoneyPaceMatch[]
}

function descending(values: number[]) {
  return [...values].sort((left, right) => right - left)
}

function scoreAtPlace(values: number[], place: number) {
  const sorted = descending(values)
  return sorted[Math.min(place - 1, sorted.length - 1)] ?? 0
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function weeklyScore(
  season: HistoricalSeason,
  entryId: string,
  periodOrder: number,
) {
  return (
    season.standings
      .find((standing) => standing.entryId === entryId)
      ?.weeklyWins.find((week) => week.week === periodOrder)?.wins ?? 0
  )
}

/**
 * CBS can retain an empty period in an old edition (2024 Week 1 is all zero).
 * Compare seasons by active pool week, while preserving the CBS label/order.
 */
export function activeHistoricalPeriods(season: HistoricalSeason) {
  return season.periods.filter((period) =>
    season.standings.some(
      (standing) =>
        (standing.weeklyWins.find((week) => week.week === period.order)?.wins ??
          0) > 0,
    ),
  )
}

export function moneyPaceForSeason(
  season: HistoricalSeason,
): MoneyPacePoint[] {
  const totals = new Map(
    season.standings.map((standing) => [standing.entryId, 0]),
  )
  return activeHistoricalPeriods(season).map((period, index) => {
    for (const standing of season.standings) {
      totals.set(
        standing.entryId,
        (totals.get(standing.entryId) ?? 0) +
          weeklyScore(season, standing.entryId, period.order),
      )
    }
    const scores = [...totals.values()]
    return {
      activeWeek: index + 1,
      periodOrder: period.order,
      periodLabel: period.description,
      thirdPlaceScore: scoreAtPlace(scores, 3),
      leaderScore: scoreAtPlace(scores, 1),
    }
  })
}

export function historicalWeeklyBenchmarks(
  history: SeasonHistoryFile,
): WeeklyScoreBenchmark[] {
  return history.seasons.flatMap((season) =>
    activeHistoricalPeriods(season).map((period, index) => {
      const scores = season.standings.map((standing) =>
        weeklyScore(season, standing.entryId, period.order),
      )
      const highScore = scoreAtPlace(scores, 1)
      return {
        seasonYear: season.seasonYear,
        activeWeek: index + 1,
        periodOrder: period.order,
        periodLabel: period.description,
        highScore,
        thirdScore: scoreAtPlace(scores, 3),
        medianScore: median(scores),
        coHighCount: scores.filter((score) => score === highScore).length,
      }
    }),
  )
}

function currentWeekScore(entry: PlayerWeekEntry) {
  return (
    entry.weekScore ??
    entry.correctPicks ??
    entry.picks.filter((pick) => pick.result === 'win').length
  )
}

export function completedCurrentWeeks(history: PlayerHistory) {
  return history.weeks
    .filter((week) => week.scored)
    .sort((left, right) => left.week - right.week)
}

export function currentStandings(
  history: PlayerHistory,
  weeks: PlayerWeek[] = completedCurrentWeeks(history),
): CurrentStanding[] {
  const totals = new Map(
    history.entries.map((entry) => [
      entry.entryId,
      { entryId: entry.entryId, name: entry.name, score: 0 },
    ]),
  )
  for (const week of weeks) {
    for (const entry of week.entries) {
      const total = totals.get(entry.entryId)
      if (total) total.score += currentWeekScore(entry)
    }
  }
  const sorted = [...totals.values()].sort(
    (left, right) =>
      right.score - left.score ||
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  )
  let previousScore: number | null = null
  let previousRank = 0
  return sorted.map((standing, index) => {
    const rank =
      previousScore === standing.score ? previousRank : index + 1
    previousScore = standing.score
    previousRank = rank
    return { ...standing, rank }
  })
}

export function currentMoneyPace(history: PlayerHistory): MoneyPacePoint[] {
  const weeks = completedCurrentWeeks(history)
  return weeks.map((week, index) => {
    const standings = currentStandings(history, weeks.slice(0, index + 1))
    return {
      activeWeek: index + 1,
      periodOrder: week.week,
      periodLabel: week.label,
      thirdPlaceScore: scoreAtPlace(
        standings.map((standing) => standing.score),
        3,
      ),
      leaderScore: scoreAtPlace(
        standings.map((standing) => standing.score),
        1,
      ),
    }
  })
}

function cumulativeHistoricalScores(
  season: HistoricalSeason,
  activeWeek: number,
) {
  const periods = activeHistoricalPeriods(season).slice(0, activeWeek)
  return new Map(
    season.standings.map((standing) => [
      standing.entryId,
      periods.reduce(
        (total, period) =>
          total + weeklyScore(season, standing.entryId, period.order),
        0,
      ),
    ]),
  )
}

/**
 * Compare one current player with the same active-week checkpoint in prior
 * fields and with the players who eventually finished in the money.
 */
export function playerMoneyPaceComparison(
  archive: SeasonHistoryFile,
  current: PlayerHistory,
  entryId: string,
): PlayerMoneyPaceComparison | null {
  const activeWeek = completedCurrentWeeks(current).length
  if (activeWeek === 0) return null
  const currentRows = currentStandings(current)
  const standing = currentRows.find((row) => row.entryId === entryId)
  if (!standing) return null
  const currentMoneyLine = scoreAtPlace(
    currentRows.map((row) => row.score),
    3,
  )

  const seasons = archive.seasons.flatMap<HistoricalMoneyPaceMatch>(
    (season) => {
      const periods = activeHistoricalPeriods(season)
      const checkpoint = periods[activeWeek - 1]
      if (!checkpoint) return []
      const scoresByEntry = cumulativeHistoricalScores(season, activeWeek)
      const fieldScores = [...scoresByEntry.values()]
      const cashers = season.standings
        .filter((row) => row.rank <= 3)
        .sort((left, right) => left.rank - right.rank)
        .map((row) => {
          const checkpointScore = scoresByEntry.get(row.entryId) ?? 0
          return {
            name: row.name,
            place: row.rank,
            checkpointScore,
            finalScore: row.seasonScore,
            gap: standing.score - checkpointScore,
          }
        })
      const thirdPlaceScore = scoreAtPlace(fieldScores, 3)
      return [
        {
          seasonYear: season.seasonYear,
          periodOrder: checkpoint.order,
          periodLabel: checkpoint.description,
          equivalentRank:
            1 + fieldScores.filter((score) => score > standing.score).length,
          thirdPlaceScore,
          gapToThird: standing.score - thirdPlaceScore,
          cashers,
        },
      ]
    },
  )
  const casherScores = seasons.flatMap((season) =>
    season.cashers.map((casher) => casher.checkpointScore),
  )
  const cashPaceMedian = median(casherScores)

  return {
    current: standing,
    activeWeek,
    currentMoneyLine,
    gapToCurrentMoneyLine: standing.score - currentMoneyLine,
    cashersAtOrBelow: casherScores.filter((score) => standing.score >= score)
      .length,
    cashersTotal: casherScores.length,
    cashPaceMedian,
    gapToCashPaceMedian: standing.score - cashPaceMedian,
    seasons,
  }
}

export function returningMoneyFinishers(
  archive: SeasonHistoryFile,
  current: PlayerHistory,
): ReturningMoneyFinisher[] {
  const currentBySlug = new Map(
    current.entries.map((entry) => [playerSlug(entry.name), entry]),
  )
  const standingsById = new Map(
    currentStandings(current).map((standing) => [
      standing.entryId,
      standing,
    ]),
  )
  const finishes = new Map<
    string,
    ReturningMoneyFinisher['finishes']
  >()
  for (const season of archive.seasons) {
    for (const standing of season.standings.filter(
      (candidate) => candidate.rank <= 3,
    )) {
      const slug = playerSlug(standing.name)
      const rows = finishes.get(slug) ?? []
      rows.push({
        seasonYear: season.seasonYear,
        place: standing.rank,
        score: standing.seasonScore,
      })
      finishes.set(slug, rows)
    }
  }
  return [...finishes.entries()]
    .flatMap(([slug, rows]) => {
      const entry = currentBySlug.get(slug)
      if (!entry) return []
      return [
        {
          name: entry.name,
          slug,
          finishes: rows.sort(
            (left, right) => right.seasonYear - left.seasonYear,
          ),
          current: standingsById.get(entry.entryId) ?? null,
        },
      ]
    })
    .sort(
      (left, right) =>
        (left.current?.rank ?? Number.MAX_SAFE_INTEGER) -
          (right.current?.rank ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name, undefined, {
          sensitivity: 'base',
        }),
    )
}

export function finalMoneyLine(season: HistoricalSeason) {
  return (
    season.standings.find((standing) => standing.rank === 3)?.seasonScore ??
    null
  )
}
