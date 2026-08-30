import type { PlayerHistory, PlayerWeek, RecommendationWeek } from './types.ts'

export function weekSeason(
  week: { seasonYear?: number },
  fallback: number,
) {
  return week.seasonYear ?? fallback
}

export function weekIsBefore(
  week: { week: number; seasonYear?: number },
  targetWeek: number,
  targetSeason: number,
  fallbackSeason: number,
) {
  const year = weekSeason(week, fallbackSeason)
  return year < targetSeason || (year === targetSeason && week.week < targetWeek)
}

export function sameSeasonWeek(
  left: { week: number; seasonYear?: number },
  right: { week: number; seasonYear?: number },
  fallbackSeason: number,
) {
  return (
    left.week === right.week &&
    weekSeason(left, fallbackSeason) === weekSeason(right, fallbackSeason)
  )
}

export function upsertSeasonWeek<T extends { week: number; seasonYear?: number }>(
  weeks: T[],
  next: T,
  seasonYear: number,
) {
  const year = next.seasonYear ?? seasonYear
  const stamped = { ...next, seasonYear: year }
  return [
    ...weeks.filter(
      (entry) =>
        weekSeason(entry, seasonYear) !== year || entry.week !== stamped.week,
    ),
    stamped,
  ].sort(
    (left, right) =>
      weekSeason(left, seasonYear) - weekSeason(right, seasonYear) ||
      left.week - right.week,
  )
}

export function weeksForSeason<T extends { seasonYear?: number }>(
  weeks: T[],
  seasonYear: number,
) {
  return weeks.filter((week) => weekSeason(week, seasonYear) === seasonYear)
}

export function mergeCareerHistory(
  current: PlayerHistory,
  archives: PlayerHistory[],
): PlayerHistory {
  const priors = archives
    .filter((history) => history.pool.seasonYear < current.pool.seasonYear)
    .sort((left, right) => left.pool.seasonYear - right.pool.seasonYear)

  const weeks: PlayerWeek[] = [
    ...priors.flatMap((history) =>
      history.weeks.map((week) => ({
        ...week,
        seasonYear: weekSeason(week, history.pool.seasonYear),
      })),
    ),
    ...current.weeks.map((week) => ({
      ...week,
      seasonYear: weekSeason(week, current.pool.seasonYear),
    })),
  ].sort(
    (left, right) =>
      weekSeason(left, current.pool.seasonYear) -
        weekSeason(right, current.pool.seasonYear) || left.week - right.week,
  )

  return {
    ...current,
    weeks,
  }
}

export function careerSeasonYears(history: PlayerHistory) {
  return [
    ...new Set(
      history.weeks.map((week) => weekSeason(week, history.pool.seasonYear)),
    ),
  ].sort((left, right) => left - right)
}

export function recommendationWeeksForSeason(
  weeks: RecommendationWeek[],
  seasonYear: number,
) {
  return weeksForSeason(weeks, seasonYear)
}
