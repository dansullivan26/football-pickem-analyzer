import { weekSeason } from './careerHistory.ts'
import type { PlayerRosterEntry, PlayerWeek } from './types'

export type PlayerRankingScope = 'season' | number

export type PlayerWinRecord = {
  wins: number
  scored: number
}

export type RankedPlayer = {
  entry: PlayerRosterEntry
  record: PlayerWinRecord
  rank: number
}

export function playerSlug(name: string) {
  return name
    .replace(/['’.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function assignPlayerSlugs(
  entries: Array<{ name: string; entryId: string }>,
) {
  const bases = entries.map(
    (entry) => playerSlug(entry.name) || playerSlug(entry.entryId) || 'player',
  )
  const used = new Map<string, number>()
  return entries.map((_, index) => {
    const base = bases[index] ?? 'player'
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    return seen === 0 ? base : `${base}-${seen + 1}`
  })
}

export function playerSlugByEntryId(
  entries: Array<{ name: string; entryId: string }>,
) {
  const slugs = assignPlayerSlugs(entries)
  return new Map(
    entries.map((entry, index) => [entry.entryId, slugs[index] ?? playerSlug(entry.name)]),
  )
}

export function entryWinRecord(entryId: string, weeks: PlayerWeek[]) {
  const picks = weeks.flatMap(
    (week) =>
      week.entries.find((entry) => entry.entryId === entryId)?.picks ?? [],
  )
  const scored = picks.filter((pick) => pick.pickedSide && pick.result)
  return {
    wins: scored.filter((pick) => pick.result === 'win').length,
    scored: scored.length,
  }
}

function winRate(record: PlayerWinRecord) {
  if (!record.scored) return null
  return record.wins / record.scored
}

export function entryWinRate(entryId: string, weeks: PlayerWeek[]) {
  return winRate(entryWinRecord(entryId, weeks))
}

function nameOrder(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

export function playerRankingWeeks(
  weeks: PlayerWeek[],
  scope: PlayerRankingScope,
  seasonYear: number,
) {
  return weeks.filter(
    (week) =>
      weekSeason(week, seasonYear) === seasonYear &&
      (scope === 'season' || week.week === scope),
  )
}

function compareRecords(
  left: PlayerWinRecord,
  right: PlayerWinRecord,
) {
  if (right.wins !== left.wins) return right.wins - left.wins
  const leftRate = winRate(left)
  const rightRate = winRate(right)
  if (leftRate == null && rightRate == null) return 0
  if (leftRate == null) return 1
  if (rightRate == null) return -1
  return rightRate - leftRate
}

/**
 * Roster order follows the win count on the chip. Rate only breaks ties, so a
 * player who skipped most of a slate cannot lead the list on a perfect 3-for-3.
 */
export function rankPlayersByWins(
  entries: PlayerRosterEntry[],
  weeks: PlayerWeek[],
): RankedPlayer[] {
  const records = new Map(
    entries.map((entry) => [entry.entryId, entryWinRecord(entry.entryId, weeks)]),
  )
  const recordFor = (entryId: string): PlayerWinRecord =>
    records.get(entryId) ?? { wins: 0, scored: 0 }

  const sorted = [...entries].sort((left, right) => {
    const leftRecord = recordFor(left.entryId)
    const rightRecord = recordFor(right.entryId)
    return (
      compareRecords(leftRecord, rightRecord) ||
      nameOrder(left.name, right.name)
    )
  })

  let rank = 0
  let previous: PlayerWinRecord | null = null
  return sorted.map((entry, index) => {
    const record = recordFor(entry.entryId)
    if (!previous || compareRecords(previous, record) !== 0) rank = index + 1
    previous = record
    return { entry, record, rank }
  })
}

export function sortPlayersByWins(
  entries: PlayerRosterEntry[],
  weeks: PlayerWeek[],
) {
  return rankPlayersByWins(entries, weeks).map((row) => row.entry)
}
