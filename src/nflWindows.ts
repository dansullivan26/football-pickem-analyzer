import {
  emptyWinRecord,
  formatAtsRecord,
  type PlayerWinRecord,
} from './playerDirectory.ts'
import type {
  FrozenRecommendation,
  PlayerPick,
  PlayerWeek,
} from './types.ts'

export const NFL_WINDOW_KEYS = ['tnf', 'sun1', 'sun4', 'snf', 'mnf'] as const

export type NflWindowKey = (typeof NFL_WINDOW_KEYS)[number]

export const NFL_WINDOW_LABELS: Record<NflWindowKey, string> = {
  tnf: 'TNF',
  sun1: 'Sunday 1:00',
  sun4: 'Sunday 4:00',
  snf: 'SNF',
  mnf: 'MNF',
}

export const NFL_WINDOW_DETAILS: Record<NflWindowKey, string> = {
  tnf: 'Thursday night',
  sun1: '1:00 ET window',
  sun4: '4:05 and 4:25 ET',
  snf: 'Sunday night',
  mnf: 'Monday night',
}

export type NflWindowRecords = Record<NflWindowKey, PlayerWinRecord>

const TIME_ZONE = 'America/New_York'

export function emptyNflWindowRecords(): NflWindowRecords {
  return {
    tnf: emptyWinRecord(),
    sun1: emptyWinRecord(),
    sun4: emptyWinRecord(),
    snf: emptyWinRecord(),
    mnf: emptyWinRecord(),
  }
}

function easternParts(kickoff: string) {
  const date = new Date(kickoff)
  if (Number.isNaN(date.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date)
    const weekday = parts.find((part) => part.type === 'weekday')?.value
    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value)
    if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null
    }
    return { weekday, hour, minute }
  } catch {
    return null
  }
}

/** NFL only. London mornings, Saturday slates, and Thanksgiving afternoon stay out. */
export function nflKickoffWindow(kickoff: string): NflWindowKey | null {
  const parts = easternParts(kickoff)
  if (!parts) return null
  const { weekday, hour } = parts
  if (weekday === 'Thu' && hour >= 19) return 'tnf'
  if (weekday === 'Sun' && hour >= 12 && hour < 15) return 'sun1'
  if (weekday === 'Sun' && hour >= 15 && hour < 18) return 'sun4'
  if (weekday === 'Sun' && hour >= 19) return 'snf'
  if (weekday === 'Mon') return 'mnf'
  return null
}

export function kickoffByEventId(
  sources: Array<Iterable<{ cbsEventId: number; kickoff?: string | null }>>,
) {
  const map = new Map<number, string>()
  for (const source of sources) {
    for (const game of source) {
      if (!game.kickoff) continue
      map.set(game.cbsEventId, game.kickoff)
    }
  }
  return map
}

function tally(
  record: PlayerWinRecord,
  result: 'win' | 'loss' | 'push',
) {
  record.scored += 1
  if (result === 'win') record.wins += 1
  else if (result === 'loss') record.losses += 1
  else record.pushes += 1
}

function addPickResult(
  records: NflWindowRecords,
  kickoff: string | undefined,
  result: 'win' | 'loss' | 'push' | null,
) {
  if (!kickoff || !result) return
  const window = nflKickoffWindow(kickoff)
  if (!window) return
  tally(records[window], result)
}

export function summarizeNflWindows(
  picks: Iterable<Pick<PlayerPick, 'sport' | 'cbsEventId' | 'pickedSide' | 'result'>>,
  kickoffs: ReadonlyMap<number, string>,
): NflWindowRecords {
  const records = emptyNflWindowRecords()
  for (const pick of picks) {
    if (pick.sport !== 'NFL' || !pick.pickedSide) continue
    addPickResult(records, kickoffs.get(pick.cbsEventId), pick.result)
  }
  return records
}

export function summarizeEntryNflWindows(
  entryId: string,
  weeks: PlayerWeek[],
  kickoffs: ReadonlyMap<number, string>,
) {
  return summarizeNflWindows(
    weeks.flatMap(
      (week) =>
        week.entries.find((entry) => entry.entryId === entryId)?.picks ?? [],
    ),
    kickoffs,
  )
}

export function summarizePoolNflWindows(
  weeks: PlayerWeek[],
  kickoffs: ReadonlyMap<number, string>,
) {
  return summarizeNflWindows(
    weeks.flatMap((week) => week.entries.flatMap((entry) => entry.picks)),
    kickoffs,
  )
}

export function summarizeCardNflWindows(games: FrozenRecommendation[]) {
  const records = emptyNflWindowRecords()
  for (const game of games) {
    if (game.sport !== 'NFL' || !game.pickedSide || !game.cover) continue
    const result =
      game.cover === 'push'
        ? 'push'
        : game.cover === game.pickedSide
          ? 'win'
          : 'loss'
    addPickResult(records, game.kickoff, result)
  }
  return records
}

export function nflWindowDetail(record: PlayerWinRecord, hint: string) {
  if (!record.scored) return hint
  return `${formatAtsRecord(record)} · ${record.scored} pick${record.scored === 1 ? '' : 's'}`
}
