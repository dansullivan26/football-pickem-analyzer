import type { PlayerRosterEntry, PlayerWeek } from './types'

export function entryWinRate(entryId: string, weeks: PlayerWeek[]) {
  const picks = weeks.flatMap(
    (week) =>
      week.entries.find((entry) => entry.entryId === entryId)?.picks ?? [],
  )
  const scored = picks.filter((pick) => pick.pickedSide && pick.result)
  if (!scored.length) return null
  return scored.filter((pick) => pick.result === 'win').length / scored.length
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
