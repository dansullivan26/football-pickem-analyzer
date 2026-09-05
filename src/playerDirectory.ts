import type { PlayerRosterEntry, PlayerWeek } from './types'

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

type WinRecord = { wins: number; scored: number }

function winRate(record: WinRecord) {
  if (!record.scored) return null
  return record.wins / record.scored
}

export function entryWinRate(entryId: string, weeks: PlayerWeek[]) {
  return winRate(entryWinRecord(entryId, weeks))
}

function nameOrder(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

/**
 * Roster order follows the win count on the chip. Rate only breaks ties, so a
 * player who skipped most of a slate cannot lead the list on a perfect 3-for-3.
 */
export function sortPlayersByWins(
  entries: PlayerRosterEntry[],
  weeks: PlayerWeek[],
) {
  const records = new Map(
    entries.map((entry) => [entry.entryId, entryWinRecord(entry.entryId, weeks)]),
  )
  const recordFor = (entryId: string): WinRecord =>
    records.get(entryId) ?? { wins: 0, scored: 0 }

  return [...entries].sort((left, right) => {
    const leftRecord = recordFor(left.entryId)
    const rightRecord = recordFor(right.entryId)
    if (rightRecord.wins !== leftRecord.wins) {
      return rightRecord.wins - leftRecord.wins
    }
    const leftRate = winRate(leftRecord)
    const rightRate = winRate(rightRecord)
    if (leftRate == null && rightRate == null) {
      return nameOrder(left.name, right.name)
    }
    if (leftRate == null) return 1
    if (rightRate == null) return -1
    if (rightRate !== leftRate) return rightRate - leftRate
    return nameOrder(left.name, right.name)
  })
}
