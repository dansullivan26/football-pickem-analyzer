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

export function entryWinRate(entryId: string, weeks: PlayerWeek[]) {
  const { wins, scored } = entryWinRecord(entryId, weeks)
  if (!scored) return null
  return wins / scored
}

function nameOrder(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

export function sortPlayersByWinRate(
  entries: PlayerRosterEntry[],
  weeks: PlayerWeek[],
) {
  return [...entries].sort((left, right) => {
    const leftRate = entryWinRate(left.entryId, weeks)
    const rightRate = entryWinRate(right.entryId, weeks)
    if (leftRate == null && rightRate == null) {
      return nameOrder(left.name, right.name)
    }
    if (leftRate == null) return 1
    if (rightRate == null) return -1
    if (rightRate !== leftRate) return rightRate - leftRate
    return nameOrder(left.name, right.name)
  })
}
