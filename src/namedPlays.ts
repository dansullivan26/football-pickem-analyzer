import {
  compareRecommendationOrder,
  type RecommendationOrderKey,
} from './cardScoring.ts'
import type { SuggestedPick } from './cardStrategy.ts'
import { etDayKey } from './gameStatus.ts'
import type {
  FrozenNamedPlay,
  FrozenRecommendation,
  RecommendationWeek,
} from './types.ts'

export const NAMED_PLAY_TIME_ZONE = 'America/New_York'
export const NAMED_PLAY_FREEZE_HOUR_ET = 8
/** TNF / MNF and other one-game days are not a field to pick from. */
export const MIN_NAMED_DAY_GAMES = 2

export type NamedPlayOptions = {
  playOfTheWeek?: FrozenNamedPlay | null
  playsOfTheDay?: readonly FrozenNamedPlay[] | null
  now?: Date | number
}

export type ResolvedNamedPlay = {
  pick: SuggestedPick
  frozenAt: string
}

function toNow(value?: Date | number) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  return Date.now()
}

export function firstCardKickoff(
  items: Iterable<{ kickoff: string }>,
): string | null {
  let first: string | null = null
  for (const item of items) {
    if (!item.kickoff) continue
    if (!first || item.kickoff.localeCompare(first) < 0) first = item.kickoff
  }
  return first
}

/**
 * Clock time on an Eastern calendar day. `dateKey` is `YYYY-MM-DD` in ET, or a
 * kickoff ISO string that is converted first.
 */
export function easternClockOnDate(
  dateKeyOrKickoff: string,
  hour: number,
  minute = 0,
): Date | null {
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(dateKeyOrKickoff)
    ? dateKeyOrKickoff
    : etDayKey(dateKeyOrKickoff)
  if (!dateKey) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  let utc = Date.UTC(year, month - 1, day, hour + 4, minute, 0, 0)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: NAMED_PLAY_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(utc))
    const got = {
      year: Number(parts.find((part) => part.type === 'year')?.value),
      month: Number(parts.find((part) => part.type === 'month')?.value),
      day: Number(parts.find((part) => part.type === 'day')?.value),
      hour: Number(parts.find((part) => part.type === 'hour')?.value),
      minute: Number(parts.find((part) => part.type === 'minute')?.value),
    }
    if (
      got.year === year &&
      got.month === month &&
      got.day === day &&
      got.hour === hour &&
      got.minute === minute
    ) {
      return new Date(utc)
    }
    const target = Date.UTC(year, month - 1, day, hour, minute)
    const actual = Date.UTC(
      got.year,
      got.month - 1,
      got.day,
      got.hour,
      got.minute,
    )
    utc += target - actual
  }
  return null
}

export function namedPlayFreezeAt(dateKeyOrKickoff: string): Date | null {
  return easternClockOnDate(dateKeyOrKickoff, NAMED_PLAY_FREEZE_HOUR_ET)
}

export function isNamedPlayReady(freezeAt: Date | null, now?: Date | number) {
  return freezeAt != null && toNow(now) >= freezeAt.getTime()
}

export function weekPlayReady(
  items: Iterable<{ kickoff: string }>,
  now?: Date | number,
) {
  const first = firstCardKickoff(items)
  return first ? isNamedPlayReady(namedPlayFreezeAt(first), now) : false
}

export function dayPlayReady(dateKey: string, now?: Date | number) {
  return isNamedPlayReady(namedPlayFreezeAt(dateKey), now)
}

export function formatNamedPlayAsOf(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: NAMED_PLAY_TIME_ZONE,
      weekday: 'short',
    }).format(date)
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: NAMED_PLAY_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
    return `${weekday} ${time} ET`
  } catch {
    return null
  }
}

function suggestedOrderKey(pick: SuggestedPick): RecommendationOrderKey {
  return {
    category: pick.category,
    edge: pick.edge,
    hook: pick.hook,
    compositeEdge: pick.compositeEdge,
    publicSupport: pick.publicSupport,
    publicPct: pick.publicPct,
    kickoff: pick.kickoff,
  }
}

export function topRecommendedPick(picks: SuggestedPick[]) {
  return (
    [...picks].sort((left, right) =>
      compareRecommendationOrder(
        suggestedOrderKey(left),
        suggestedOrderKey(right),
      ),
    )[0] ?? null
  )
}

function findPickByEvent(picks: readonly SuggestedPick[], cbsEventId: number) {
  return picks.find((pick) => pick.cbsEventId === cbsEventId) ?? null
}

export function resolveWeekNamedPlay(
  picks: SuggestedPick[],
  cardItems: Iterable<{ kickoff: string }>,
  options: NamedPlayOptions = {},
): ResolvedNamedPlay | null {
  const frozen = options.playOfTheWeek
  if (frozen) {
    const pick = findPickByEvent(picks, frozen.cbsEventId)
    return pick ? { pick, frozenAt: frozen.frozenAt } : null
  }
  if (!weekPlayReady(cardItems, options.now)) return null
  const pick = topRecommendedPick(picks)
  const freezeAt = namedPlayFreezeAt(firstCardKickoff(cardItems) ?? '')
  return pick && freezeAt ? { pick, frozenAt: freezeAt.toISOString() } : null
}

export function dayNamedPlayEligible(gameCount: number) {
  return gameCount >= MIN_NAMED_DAY_GAMES
}

export function dayFieldSize(
  games: Array<{ cbsEventId: number; kickoff?: string | null }>,
  cbsEventId: number,
) {
  const game = games.find((row) => row.cbsEventId === cbsEventId)
  const dateKey = game ? etDayKey(game.kickoff ?? '') : null
  if (!dateKey) return 0
  return games.filter((row) => etDayKey(row.kickoff ?? '') === dateKey).length
}

export function resolveDayNamedPlay(
  dayPicks: SuggestedPick[],
  dateKey: string,
  options: NamedPlayOptions = {},
  dayGameCount = dayPicks.length,
): ResolvedNamedPlay | null {
  if (!dayNamedPlayEligible(dayGameCount)) return null
  const frozen = (options.playsOfTheDay ?? []).find((play) =>
    dayPicks.some((pick) => pick.cbsEventId === play.cbsEventId),
  )
  if (frozen) {
    const pick = findPickByEvent(dayPicks, frozen.cbsEventId)
    return pick ? { pick, frozenAt: frozen.frozenAt } : null
  }
  if (!dayPlayReady(dateKey, options.now)) return null
  const pick = topRecommendedPick(dayPicks)
  const freezeAt = namedPlayFreezeAt(dateKey)
  return pick && freezeAt ? { pick, frozenAt: freezeAt.toISOString() } : null
}

function frozenOrderKey(game: FrozenRecommendation): RecommendationOrderKey {
  return {
    category: game.category,
    edge: null,
    hook: game.hook,
    compositeEdge: game.compositeEdge ?? game.score ?? 0,
    publicSupport: 'none',
    publicPct: null,
    kickoff: game.kickoff,
  }
}

export function topFrozenNamedPlay(games: FrozenRecommendation[]) {
  const candidates = games.filter(
    (game) => game.pickedSide && game.category !== 'pending',
  )
  if (candidates.length === 0) return null
  return [...candidates].sort((left, right) =>
    compareRecommendationOrder(frozenOrderKey(left), frozenOrderKey(right)),
  )[0]
}

function stampNamedPlay(
  game: FrozenRecommendation | null,
  frozenAt: string,
  backfilled = false,
): FrozenNamedPlay | null {
  if (!game) return null
  return backfilled
    ? { cbsEventId: game.cbsEventId, frozenAt, backfilled: true }
    : { cbsEventId: game.cbsEventId, frozenAt }
}

function stampMissingNamedPlays(
  games: FrozenRecommendation[],
  existing: {
    playOfTheWeek?: FrozenNamedPlay | null
    playsOfTheDay?: FrozenNamedPlay[] | null
  } | null,
  now: number,
  resolveFrozenAt: (dateKeyOrKickoff: string) => string | null,
  backfilled: boolean,
) {
  const playOfTheWeek =
    existing?.playOfTheWeek ??
    (() => {
      if (!weekPlayReady(games, now)) return null
      const first = firstCardKickoff(games)
      const frozenAt = first ? resolveFrozenAt(first) : null
      return frozenAt
        ? stampNamedPlay(topFrozenNamedPlay(games), frozenAt, backfilled)
        : null
    })()

  const existingDayPlays = existing?.playsOfTheDay ?? []
  const playsOfTheDay: FrozenNamedPlay[] = []
  for (const [dateKey, dayGames] of groupFrozenByEtDay(games)) {
    if (!dayNamedPlayEligible(dayGames.length)) continue
    const kept = existingDayPlays.find((play) =>
      dayGames.some((game) => game.cbsEventId === play.cbsEventId),
    )
    if (kept) {
      playsOfTheDay.push(kept)
      continue
    }
    if (!dayPlayReady(dateKey, now)) continue
    const frozenAt = resolveFrozenAt(dateKey)
    if (!frozenAt) continue
    const stamped = stampNamedPlay(
      topFrozenNamedPlay(dayGames),
      frozenAt,
      backfilled,
    )
    if (stamped) playsOfTheDay.push(stamped)
  }

  return { playOfTheWeek, playsOfTheDay }
}

function groupFrozenByEtDay(games: FrozenRecommendation[]) {
  const groups = new Map<string, FrozenRecommendation[]>()
  for (const game of games) {
    const dateKey = etDayKey(game.kickoff)
    if (!dateKey) continue
    const existing = groups.get(dateKey)
    if (existing) existing.push(game)
    else groups.set(dateKey, [game])
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

/**
 * Lock named plays once, on the 8:00 AM ET morning of the first kickoff
 * (week) or that day's kickoffs (day). Later snapshots keep the stamp.
 */
export function freezeNamedPlays(
  games: FrozenRecommendation[],
  existing: {
    playOfTheWeek?: FrozenNamedPlay | null
    playsOfTheDay?: FrozenNamedPlay[] | null
  } | null,
  capturedAt: string,
  now = Date.parse(capturedAt) || Date.now(),
) {
  return stampMissingNamedPlays(
    games,
    existing,
    now,
    () => capturedAt,
    false,
  )
}

/**
 * Fill missing named-play stamps from the kickoff-frozen card. Uses 8:00 AM ET
 * that morning as the as-of time and marks the stamp backfilled. Existing live
 * locks are left alone.
 */
export function backfillNamedPlays(
  week: RecommendationWeek,
  now = Date.now(),
): RecommendationWeek {
  const next = stampMissingNamedPlays(
    week.games,
    week,
    now,
    (dateKeyOrKickoff) =>
      namedPlayFreezeAt(dateKeyOrKickoff)?.toISOString() ?? null,
    true,
  )
  const sameWeek =
    next.playOfTheWeek?.cbsEventId === week.playOfTheWeek?.cbsEventId &&
    next.playOfTheWeek?.frozenAt === week.playOfTheWeek?.frozenAt &&
    next.playOfTheWeek?.backfilled === week.playOfTheWeek?.backfilled
  const existingDays = week.playsOfTheDay ?? []
  const sameDays =
    next.playsOfTheDay.length === existingDays.length &&
    next.playsOfTheDay.every(
      (play, index) =>
        play.cbsEventId === existingDays[index]?.cbsEventId &&
        play.frozenAt === existingDays[index]?.frozenAt &&
        play.backfilled === existingDays[index]?.backfilled,
    )
  if (sameWeek && sameDays) return week
  return {
    ...week,
    playOfTheWeek: next.playOfTheWeek,
    playsOfTheDay: next.playsOfTheDay,
  }
}

export function backfillNamedPlaysOnWeeks(
  weeks: RecommendationWeek[],
  now = Date.now(),
) {
  return weeks.map((week) => backfillNamedPlays(week, now))
}

export function namedPlayGames(
  weeks: RecommendationWeek[],
  kind: 'week' | 'day',
) {
  const games: FrozenRecommendation[] = []
  for (const week of weeks) {
    const ids =
      kind === 'week'
        ? week.playOfTheWeek
          ? [week.playOfTheWeek.cbsEventId]
          : []
        : (week.playsOfTheDay ?? []).map((play) => play.cbsEventId)
    for (const id of ids) {
      const game = week.games.find((row) => row.cbsEventId === id)
      if (!game) continue
      if (kind === 'day' && !dayNamedPlayEligible(dayFieldSize(week.games, id))) {
        continue
      }
      games.push(game)
    }
  }
  return games
}

export function namedPlayKindForGame(
  week:
    | (Pick<RecommendationWeek, 'playOfTheWeek' | 'playsOfTheDay'> & {
        games?: FrozenRecommendation[]
      })
    | null
    | undefined,
  cbsEventId: number,
): 'week' | 'day' | null {
  if (week?.playOfTheWeek?.cbsEventId === cbsEventId) return 'week'
  if (week?.playsOfTheDay?.some((play) => play.cbsEventId === cbsEventId)) {
    if (
      week.games &&
      !dayNamedPlayEligible(dayFieldSize(week.games, cbsEventId))
    ) {
      return null
    }
    return 'day'
  }
  return null
}
