import { weekSeason } from './careerHistory.ts'
import {
  picksCountCompletionChange,
  picksCountStartChange,
} from './pickChanges.ts'
import type {
  PlayerHistory,
  PicksCountChange,
  RecommendationHistory,
  Slate,
} from './types.ts'

export type CardTimingBucket =
  | 'early-full'
  | 'friday-full'
  | 'late-full'
  | 'day-of'
  | 'ahead'
  | 'waiting'
  | 'unknown'

export type LineWatchRead = 'unlikely' | 'possible' | 'likely' | 'unknown'
export type LineWatchWarmth = 'early' | 'signs' | 'growing' | 'established'

export type WeekCardTiming = {
  week: number
  label: string
  picksCount: number
  maxPicksCount: number
  bucket: CardTimingBucket
  completedAt: string | null
  todayGames: number
  throughGames: number
  remainingGames: number
}

export type PlayerCardTimingSummary = {
  read: LineWatchRead
  label: string
  warmth: LineWatchWarmth
  sentence: string
  thisWeek: WeekCardTiming | null
  thisWeekLine: string | null
  earlyFullWeeks: number
  lateWeeks: number
  dayOfWeeks: number
  classifiedWeeks: number
}

export const LINE_WATCH_LABELS: Record<LineWatchRead, string> = {
  unlikely: 'Unlikely watching lines',
  possible: 'Might watch the lines',
  likely: 'Looks like they watch the lines',
  unknown: 'Still building a timing read',
}

export const LINE_WATCH_WARMTH_LABELS: Record<LineWatchWarmth, string> = {
  early: 'Early read',
  signs: 'Showing signs',
  growing: 'Pattern growing',
  established: 'Established pattern',
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function zonedPart(
  iso: string,
  timeZone: string,
  type: Intl.DateTimeFormatPartTypes,
) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(iso))
    return parts.find((part) => part.type === type)?.value ?? null
  } catch {
    return null
  }
}

export function zonedWeekday(iso: string, timeZone: string) {
  const name = zonedPart(iso, timeZone, 'weekday')
  if (!name || WEEKDAY_INDEX[name] == null) return null
  return WEEKDAY_INDEX[name]
}

export function zonedDateIso(iso: string, timeZone: string) {
  const year = zonedPart(iso, timeZone, 'year')
  const month = zonedPart(iso, timeZone, 'month')
  const day = zonedPart(iso, timeZone, 'day')
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

function shiftDateIso(dateIso: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso)
  if (!match) return null
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + days,
  )
  const shifted = new Date(utc)
  const year = String(shifted.getUTCFullYear())
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Thursday of the NFL/CFB week that contains this kickoff, in `timeZone`. */
export function weekThursdayDate(firstKickoff: string, timeZone: string) {
  const date = zonedDateIso(firstKickoff, timeZone)
  const weekday = zonedWeekday(firstKickoff, timeZone)
  if (!date || weekday == null) return null
  const back = (weekday - 4 + 7) % 7
  return shiftDateIso(date, -back)
}

export function gamesByKickoffDate(kickoffs: string[], timeZone: string) {
  const counts = new Map<string, number>()
  for (const kickoff of kickoffs) {
    const date = zonedDateIso(kickoff, timeZone)
    if (!date) continue
    counts.set(date, (counts.get(date) ?? 0) + 1)
  }
  return counts
}

export function slateProgressByDate(
  kickoffs: string[],
  asOfDate: string,
  timeZone: string,
) {
  const byDate = gamesByKickoffDate(kickoffs, timeZone)
  let through = 0
  let remaining = 0
  for (const [date, count] of byDate) {
    if (date <= asOfDate) through += count
    else remaining += count
  }
  return {
    today: byDate.get(asOfDate) ?? 0,
    through,
    remaining,
    total: through + remaining,
  }
}

function countsNear(value: number, target: number, slack = 1) {
  return Math.abs(value - target) <= slack
}

export function classifyAgainstThursday(
  atOrBefore: string,
  thursday: string,
  timeZone: string,
): Extract<CardTimingBucket, 'early-full' | 'friday-full' | 'late-full'> | null {
  const date = zonedDateIso(atOrBefore, timeZone)
  if (!date) return null
  if (date <= thursday) return 'early-full'
  const friday = shiftDateIso(thursday, 1)
  if (friday && date === friday) return 'friday-full'
  return 'late-full'
}

function kickoffsForWeek(
  week: number,
  seasonYear: number,
  recommendations: RecommendationHistory | null | undefined,
  slate: Slate | null | undefined,
) {
  const recWeek = recommendations?.weeks.find(
    (row) =>
      row.week === week && weekSeason(row, seasonYear) === seasonYear,
  )
  const recTimes = (recWeek?.games ?? [])
    .map((game) => game.kickoff)
    .filter((kickoff): kickoff is string => Boolean(kickoff))
  if (recTimes.length) return recTimes
  if (slate?.week.order === week) {
    return slate.games.map((game) => game.kickoff).filter(Boolean)
  }
  return []
}

function hadLookByThursday(
  changes: PicksCountChange[],
  thursday: string,
  timeZone: string,
) {
  return changes.some((row) => {
    const at = zonedDateIso(row.window.atOrBefore, timeZone)
    const after = row.window.after
      ? zonedDateIso(row.window.after, timeZone)
      : null
    return (at != null && at <= thursday) || (after != null && after <= thursday)
  })
}

function lineWatchWarmth(classifiedWeeks: number): LineWatchWarmth {
  if (classifiedWeeks >= 10) return 'established'
  if (classifiedWeeks >= 6) return 'growing'
  if (classifiedWeeks >= 3) return 'signs'
  return 'early'
}

function readFromCounts(
  earlyFullWeeks: number,
  lateWeeks: number,
  fridayWeeks: number,
  dayOfWeeks: number,
  classifiedWeeks: number,
): LineWatchRead {
  if (!classifiedWeeks) return 'unknown'
  if (earlyFullWeeks / classifiedWeeks >= 0.7) return 'unlikely'
  if ((lateWeeks + dayOfWeeks) / classifiedWeeks >= 0.7) return 'likely'
  if (fridayWeeks + lateWeeks + dayOfWeeks > earlyFullWeeks) return 'possible'
  if (earlyFullWeeks > lateWeeks + dayOfWeeks) return 'unlikely'
  return 'possible'
}

function thisWeekLine(week: WeekCardTiming, timeZone: string) {
  const stamp = week.completedAt
    ? zonedDateIso(week.completedAt, timeZone)
    : null
  const when = stamp ? ` by the ${stamp} dump` : ''
  const day =
    week.todayGames === 1 ? '1 slate game' : `${week.todayGames} slate games`
  const through =
    week.throughGames === 1
      ? '1 game through today'
      : `${week.throughGames} games through today`
  if (week.bucket === 'early-full') {
    const leftover =
      week.remainingGames > 0
        ? ` — the leftover ${week.remainingGames} were locked before they kicked off`
        : ''
    return `Week ${week.week}: ${week.picksCount}/${week.maxPicksCount} in by Thursday${when}${leftover}.`
  }
  if (week.bucket === 'friday-full') {
    return `Week ${week.week}: filled ${week.picksCount}/${week.maxPicksCount} on Friday${when}.`
  }
  if (week.bucket === 'late-full') {
    return `Week ${week.week}: filled ${week.picksCount}/${week.maxPicksCount} Saturday or later${when}.`
  }
  if (week.bucket === 'day-of') {
    return `Week ${week.week}: ${week.picksCount}/${week.maxPicksCount} matches ${day} (${through}). Day-of picking, not a slow 25-count.`
  }
  if (week.bucket === 'ahead') {
    const extra = week.picksCount - week.throughGames
    return `Week ${week.week}: ${week.picksCount}/${week.maxPicksCount} with ${day} today — about ${extra} future game${extra === 1 ? '' : 's'} already locked.`
  }
  if (week.bucket === 'waiting') {
    return `Week ${week.week}: ${week.picksCount}/${week.maxPicksCount} vs ${through}. Behind the days that have already been played.`
  }
  return `Week ${week.week}: ${week.picksCount}/${week.maxPicksCount} submitted.`
}

function seasonSentence(
  read: LineWatchRead,
  earlyFullWeeks: number,
  lateWeeks: number,
  dayOfWeeks: number,
  classifiedWeeks: number,
) {
  if (read === 'unknown') {
    return 'Need a week where CBS reports the hidden submitted count. A Thursday 25/25 still means they locked weekend games early. Matching only that day’s slate (1 on Thursday, Saturday’s games on Saturday) looks like they wait on the live number. Flips after they lock are still invisible.'
  }
  if (read === 'unlikely') {
    return classifiedWeeks === 1
      ? 'Had the full card in by Thursday, including games that had not kicked off yet. Weekend line shopping looks unlikely. They can still flip; CBS will not show it.'
      : `Locked a full card by Thursday in ${earlyFullWeeks} of ${classifiedWeeks} tracked weeks — weekend games included. Line shopping looks unlikely. They can still flip after that; CBS will not show it.`
  }
  if (read === 'likely') {
    if (classifiedWeeks === 1 && dayOfWeeks === 1) {
      return 'Submitted about as many picks as that day had games. That is the day-of / live-line tell, not a half-finished 25-count.'
    }
    return classifiedWeeks === 1
      ? 'Waited until Saturday or later to finish games that had not kicked off yet. That is the “I want the live number vs CBS” tell.'
      : `Day-of or late fills in ${lateWeeks + dayOfWeeks} of ${classifiedWeeks} tracked weeks. They look like they wait on the live number vs CBS.`
  }
  return 'Timing is mixed so far: some early lock-ins of future games, some day-of fills. Treat them as someone who might watch movement.'
}

export function classifyWeekCardTiming({
  week,
  label,
  picksCount,
  maxPicksCount,
  completedAt,
  lastDelta,
  thursday,
  timeZone,
  hadThursdayLook,
  inProgress,
  kickoffs,
  asOfIso,
}: {
  week: number
  label: string
  picksCount: number
  maxPicksCount: number
  completedAt: string | null
  lastDelta: number | null
  thursday: string | null
  timeZone: string
  hadThursdayLook: boolean
  inProgress: boolean
  kickoffs: string[]
  asOfIso: string
}): WeekCardTiming {
  const asOfDate = zonedDateIso(asOfIso, timeZone) ?? ''
  const progress = slateProgressByDate(kickoffs, asOfDate, timeZone)
  const full = picksCount >= maxPicksCount && maxPicksCount > 0
  let bucket: CardTimingBucket = 'unknown'
  if (full && completedAt && thursday) {
    const classified = classifyAgainstThursday(
      completedAt,
      thursday,
      timeZone,
    )
    if (classified === 'late-full' && !hadThursdayLook) bucket = 'unknown'
    else if (classified) bucket = classified
  } else if (full && completedAt) {
    bucket = 'unknown'
  } else if (progress.total > 0) {
    const matchesToday =
      progress.today > 0 &&
      (countsNear(picksCount, progress.today) ||
        (lastDelta != null && countsNear(lastDelta, progress.today)))
    const matchesThrough = countsNear(picksCount, progress.through)
    if (picksCount <= 0) {
      bucket =
        progress.through > 0 && asOfDate > (thursday ?? '')
          ? 'waiting'
          : 'unknown'
    } else if (matchesToday || matchesThrough) {
      bucket = 'day-of'
    } else if (picksCount > progress.through + 1) {
      bucket = 'ahead'
    } else if (picksCount < progress.through - 1) {
      bucket = inProgress ? 'waiting' : 'unknown'
    }
  }

  return {
    week,
    label,
    picksCount,
    maxPicksCount,
    bucket,
    completedAt,
    todayGames: progress.today,
    throughGames: progress.through,
    remainingGames: progress.remaining,
  }
}

export function summarizePlayerCardTiming(
  entryId: string,
  history: PlayerHistory,
  recommendations?: RecommendationHistory | null,
  slate?: Slate | null,
  nowIso?: string,
): PlayerCardTimingSummary | null {
  const timeZone = history.source.timezone || 'America/Indianapolis'
  const seasonYear = history.pool.seasonYear
  const weeks: WeekCardTiming[] = []

  for (const week of history.weeks) {
    const entry = week.entries.find((row) => row.entryId === entryId)
    if (!entry || entry.maxPicksCount == null) continue
    const maxPicksCount = entry.maxPicksCount
    if (maxPicksCount <= 0) continue
    const picksCount = entry.picksCount ?? 0
    const kickoffs = kickoffsForWeek(
      week.week,
      weekSeason(week, seasonYear),
      recommendations,
      slate,
    )
    const thursday = kickoffs[0]
      ? weekThursdayDate(
          kickoffs.reduce((earliest, kickoff) =>
            kickoff < earliest ? kickoff : earliest,
          ),
          timeZone,
        )
      : null
    const weekChanges = (history.picksCountChanges ?? []).filter(
      (row) => row.week === week.week && row.entryId === entryId,
    )
    const lastChange = weekChanges.at(-1) ?? null
    const completion =
      picksCountCompletionChange(
        history.picksCountChanges,
        week.week,
        entryId,
        maxPicksCount,
      ) ??
      (picksCount >= maxPicksCount
        ? picksCountStartChange(
            history.picksCountChanges,
            week.week,
            entryId,
          )
        : null)
    const completedAt =
      completion?.window.atOrBefore ??
      (picksCount >= maxPicksCount ? entry.picksCountFirstSeenAt ?? null : null)
    const asOfIso =
      completedAt ??
      lastChange?.window.atOrBefore ??
      entry.picksCountFirstSeenAt ??
      nowIso ??
      history.source.fetchedAt

    weeks.push(
      classifyWeekCardTiming({
        week: week.week,
        label: week.label,
        picksCount,
        maxPicksCount,
        completedAt,
        lastDelta:
          lastChange && lastChange.from != null
            ? lastChange.to - lastChange.from
            : lastChange
              ? lastChange.to
              : null,
        thursday,
        timeZone,
        hadThursdayLook: thursday
          ? hadLookByThursday(weekChanges, thursday, timeZone)
          : false,
        inProgress: week.status !== 'scored',
        kickoffs,
        asOfIso,
      }),
    )
  }

  if (weeks.length === 0) return null

  const classified = weeks.filter(
    (week) =>
      week.bucket === 'early-full' ||
      week.bucket === 'friday-full' ||
      week.bucket === 'late-full' ||
      week.bucket === 'day-of',
  )
  const earlyFullWeeks = classified.filter(
    (week) => week.bucket === 'early-full',
  ).length
  const fridayWeeks = classified.filter(
    (week) => week.bucket === 'friday-full',
  ).length
  const lateWeeks = classified.filter(
    (week) => week.bucket === 'late-full',
  ).length
  const dayOfWeeks = classified.filter(
    (week) => week.bucket === 'day-of',
  ).length
  const classifiedWeeks = classified.length
  const currentWeek = slate?.week.order
  const thisWeek =
    weeks.find((week) => week.week === currentWeek) ?? weeks.at(-1) ?? null

  let read = readFromCounts(
    earlyFullWeeks,
    lateWeeks,
    fridayWeeks,
    dayOfWeeks,
    classifiedWeeks,
  )
  if (read === 'unknown' && thisWeek?.bucket === 'day-of') read = 'likely'
  if (read === 'unknown' && thisWeek?.bucket === 'ahead') read = 'possible'
  if (read === 'unknown' && thisWeek?.bucket === 'waiting') read = 'likely'

  return {
    read,
    label: LINE_WATCH_LABELS[read],
    warmth: lineWatchWarmth(Math.max(classifiedWeeks, thisWeek ? 1 : 0)),
    sentence: seasonSentence(
      read,
      earlyFullWeeks,
      lateWeeks,
      dayOfWeeks,
      classifiedWeeks,
    ),
    thisWeek,
    thisWeekLine: thisWeek ? thisWeekLine(thisWeek, timeZone) : null,
    earlyFullWeeks,
    lateWeeks,
    dayOfWeeks,
    classifiedWeeks,
  }
}
