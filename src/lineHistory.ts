import type {
  LineHistory,
  LineHistoryGame,
  LineTick,
  OddsEvent,
  TotalTick,
} from './types.ts'

type HistoryEvent = Pick<OddsEvent, 'cbsEventId' | 'lines' | 'totals'>

/** Same bound fetch-odds uses vs the pool line: a jump this large is a bad snapshot. */
const MAX_TICK_JUMP = 14

function appendTick<T>(
  ticks: T[],
  next: T,
  valueOf: (tick: T) => number,
): T[] {
  const last = ticks[ticks.length - 1]
  if (last && valueOf(last) === valueOf(next)) return ticks
  if (last && Math.abs(valueOf(last) - valueOf(next)) > MAX_TICK_JUMP) {
    return ticks
  }
  return [...ticks, next]
}

function spreadTicks(
  prior: LineTick[] | undefined,
  entry: { line: number; retrievedAt: string; previousLine?: number } | undefined,
  runAt: string,
  previousUpdatedAt: string | null,
): LineTick[] {
  let ticks = [...(prior ?? [])]
  if (!entry || typeof entry.line !== 'number') return ticks

  const at = entry.retrievedAt || runAt
  if (
    ticks.length === 0 &&
    typeof entry.previousLine === 'number' &&
    previousUpdatedAt
  ) {
    ticks = appendTick(
      ticks,
      { at: previousUpdatedAt, home: entry.previousLine },
      (tick) => tick.home,
    )
  }
  return appendTick(ticks, { at, home: entry.line }, (tick) => tick.home)
}

function totalTicks(
  prior: TotalTick[] | undefined,
  entry: { line: number; retrievedAt: string; previousLine?: number } | undefined,
  runAt: string,
  previousUpdatedAt: string | null,
): TotalTick[] {
  let ticks = [...(prior ?? [])]
  if (!entry || typeof entry.line !== 'number') return ticks

  const at = entry.retrievedAt || runAt
  if (
    ticks.length === 0 &&
    typeof entry.previousLine === 'number' &&
    previousUpdatedAt
  ) {
    ticks = appendTick(
      ticks,
      { at: previousUpdatedAt, line: entry.previousLine },
      (tick) => tick.line,
    )
  }
  return appendTick(ticks, { at, line: entry.line }, (tick) => tick.line)
}

export function updateLineHistory({
  previous,
  week,
  events,
  runAt,
  previousUpdatedAt,
}: {
  previous: LineHistory | null
  week: { order: number; label: string }
  events: HistoryEvent[]
  runAt: string
  previousUpdatedAt: string | null
}): LineHistory {
  const keepPrevious = previous?.week === week.order ? previous : null
  const byEvent = new Map(
    (keepPrevious?.games ?? []).map((game) => [game.cbsEventId, game]),
  )
  const games: LineHistoryGame[] = []
  const seen = new Set<number>()

  for (const event of events) {
    if (event.cbsEventId == null) continue
    seen.add(event.cbsEventId)
    const prior = byEvent.get(event.cbsEventId)
    const ticks = spreadTicks(
      prior?.ticks,
      event.lines.draftkings,
      runAt,
      previousUpdatedAt,
    )
    const totals = totalTicks(
      prior?.totals,
      event.totals?.draftkings,
      runAt,
      previousUpdatedAt,
    )
    if (ticks.length === 0 && totals.length === 0) continue
    games.push({
      cbsEventId: event.cbsEventId,
      ticks,
      ...(totals.length > 0 ? { totals } : {}),
    })
  }

  for (const prior of keepPrevious?.games ?? []) {
    if (!seen.has(prior.cbsEventId)) games.push(prior)
  }

  games.sort((a, b) => a.cbsEventId - b.cbsEventId)

  return {
    week: week.order,
    label: week.label,
    updatedAt: runAt,
    games,
  }
}

export function lineHistoryByEvent(
  history: LineHistory | null | undefined,
  week: number,
) {
  if (!history || history.week !== week) return new Map<number, LineHistoryGame>()
  return new Map(history.games.map((game) => [game.cbsEventId, game]))
}
