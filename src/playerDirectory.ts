import { weekSeason } from './careerHistory.ts'
import {
  comparePlayerReadability,
  type PlayerReadability,
} from './playerPrediction.ts'
import type { PlayerRosterEntry, PlayerWeek } from './types'

export type PlayerRankingScope = 'season' | 'readability' | number

export type PlayerWinRecord = {
  wins: number
  losses: number
  pushes: number
  scored: number
}

export type PlayerAtsSplits = {
  all: PlayerWinRecord
  nfl: PlayerWinRecord
  ncaaf: PlayerWinRecord
}

export type RankedPlayer = {
  entry: PlayerRosterEntry
  record: PlayerWinRecord
  ats: PlayerAtsSplits
  rank: number
  readability?: PlayerReadability
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

export function emptyWinRecord(): PlayerWinRecord {
  return { wins: 0, losses: 0, pushes: 0, scored: 0 }
}

export function emptyAtsSplits(): PlayerAtsSplits {
  return {
    all: emptyWinRecord(),
    nfl: emptyWinRecord(),
    ncaaf: emptyWinRecord(),
  }
}

function tallyPick(record: PlayerWinRecord, result: 'win' | 'loss' | 'push') {
  record.scored += 1
  if (result === 'win') record.wins += 1
  else if (result === 'loss') record.losses += 1
  else record.pushes += 1
}

export function entryAtsSplits(
  entryId: string,
  weeks: PlayerWeek[],
): PlayerAtsSplits {
  const splits = emptyAtsSplits()
  const picks = weeks.flatMap(
    (week) =>
      week.entries.find((entry) => entry.entryId === entryId)?.picks ?? [],
  )
  for (const pick of picks) {
    if (!pick.pickedSide || !pick.result) continue
    tallyPick(splits.all, pick.result)
    if (pick.sport === 'NFL') tallyPick(splits.nfl, pick.result)
    else if (pick.sport === 'NCAAF') tallyPick(splits.ncaaf, pick.result)
  }
  return splits
}

export function entryWinRecord(entryId: string, weeks: PlayerWeek[]) {
  return entryAtsSplits(entryId, weeks).all
}

/** Raw CBS ATS book: 12-8, or 12-8-1 when there is a push. */
export function formatAtsRecord(record: PlayerWinRecord) {
  if (!record.scored) return '—'
  return record.pushes
    ? `${record.wins}-${record.losses}-${record.pushes}`
    : `${record.wins}-${record.losses}`
}

export function formatAtsSplitsLine(ats: PlayerAtsSplits) {
  if (!ats.all.scored) return null
  const parts = [`${formatAtsRecord(ats.all)} ATS`]
  if (ats.nfl.scored) parts.push(`NFL ${formatAtsRecord(ats.nfl)}`)
  if (ats.ncaaf.scored) parts.push(`NCAAF ${formatAtsRecord(ats.ncaaf)}`)
  return parts.join(' · ')
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
  const weekScope = scope === 'readability' ? 'season' : scope
  return weeks.filter(
    (week) =>
      weekSeason(week, seasonYear) === seasonYear &&
      (weekScope === 'season' || week.week === weekScope),
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
  const splitsByEntry = new Map(
    entries.map((entry) => [entry.entryId, entryAtsSplits(entry.entryId, weeks)]),
  )
  const recordFor = (entryId: string): PlayerWinRecord =>
    splitsByEntry.get(entryId)?.all ?? emptyWinRecord()

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
    return {
      entry,
      record,
      ats: splitsByEntry.get(entry.entryId) ?? emptyAtsSplits(),
      rank,
    }
  })
}

export function sortPlayersByWins(
  entries: PlayerRosterEntry[],
  weeks: PlayerWeek[],
) {
  return rankPlayersByWins(entries, weeks).map((row) => row.entry)
}

export function rankPlayersByReadability(
  entries: PlayerRosterEntry[],
  weeks: PlayerWeek[],
  readability: Map<string, PlayerReadability>,
): RankedPlayer[] {
  const byWins = new Map(
    rankPlayersByWins(entries, weeks).map((row) => [row.entry.entryId, row]),
  )
  const readFor = (entryId: string): PlayerReadability =>
    readability.get(entryId) ?? {
      score: 0,
      solidSignals: 0,
      thinSignals: 0,
      picks: 0,
      label: 'Still building',
      detail: '0 graded picks',
    }

  const sorted = [...entries].sort((left, right) => {
    return (
      comparePlayerReadability(readFor(left.entryId), readFor(right.entryId)) ||
      nameOrder(left.name, right.name)
    )
  })

  let rank = 0
  let previous: PlayerReadability | null = null
  return sorted.map((entry, index) => {
    const row = readFor(entry.entryId)
    if (!previous || comparePlayerReadability(previous, row) !== 0) {
      rank = index + 1
    }
    previous = row
    const wins = byWins.get(entry.entryId)
    return {
      entry,
      record: wins?.record ?? emptyWinRecord(),
      ats: wins?.ats ?? emptyAtsSplits(),
      rank,
      readability: row,
    }
  })
}
