import { sameSeasonWeek } from './careerHistory.ts'
import type { PlayerHistory, PlayerPick } from './types.ts'

export type PoolGameRecord = {
  correct: number
  wrong: number
  push: number
  unpicked: number
  pending: number
}

function emptyRecord(): PoolGameRecord {
  return { correct: 0, wrong: 0, push: 0, unpicked: 0, pending: 0 }
}

function tallyPick(record: PoolGameRecord, pick: PlayerPick | undefined) {
  if (!pick || pick.matchStatus === 'unpicked' || !pick.pickedSide) {
    record.unpicked += 1
    return
  }
  if (pick.result === 'win') record.correct += 1
  else if (pick.result === 'loss') record.wrong += 1
  else if (pick.result === 'push') record.push += 1
  else record.pending += 1
}

function weekForGame(
  history: PlayerHistory,
  week: number,
  seasonYear = history.pool.seasonYear,
) {
  return (
    history.weeks.find((row) =>
      sameSeasonWeek(row, { week, seasonYear }, history.pool.seasonYear),
    ) ?? null
  )
}

function entriesForField(
  entries: PlayerHistory['weeks'][number]['entries'],
  excludeEntryId?: string | null,
) {
  if (!excludeEntryId) return entries
  return entries.filter((entry) => entry.entryId !== excludeEntryId)
}

/** Pool ATS book for one slate game: correct, wrong, unpicked. */
export function poolRecordForGame(
  history: PlayerHistory,
  week: number,
  cbsEventId: number,
  seasonYear = history.pool.seasonYear,
  excludeEntryId?: string | null,
): PoolGameRecord | null {
  const weekRow = weekForGame(history, week, seasonYear)
  if (!weekRow) return null
  const record = emptyRecord()
  for (const entry of entriesForField(weekRow.entries, excludeEntryId)) {
    tallyPick(
      record,
      entry.picks.find((pick) => pick.cbsEventId === cbsEventId),
    )
  }
  return record
}

export function poolRecordsForWeek(
  history: PlayerHistory,
  week: number,
  seasonYear = history.pool.seasonYear,
  excludeEntryId?: string | null,
): Map<number, PoolGameRecord> {
  const weekRow = weekForGame(history, week, seasonYear)
  const records = new Map<number, PoolGameRecord>()
  if (!weekRow) return records
  const entries = entriesForField(weekRow.entries, excludeEntryId)

  const eventIds = new Set<number>()
  for (const entry of entries) {
    for (const pick of entry.picks) eventIds.add(pick.cbsEventId)
  }
  for (const cbsEventId of eventIds) {
    const record = emptyRecord()
    for (const entry of entries) {
      tallyPick(
        record,
        entry.picks.find((pick) => pick.cbsEventId === cbsEventId),
      )
    }
    records.set(cbsEventId, record)
  }
  return records
}

export function poolRecordIsGraded(
  record: PoolGameRecord | null | undefined,
): record is PoolGameRecord {
  if (!record) return false
  return record.correct + record.wrong + record.push > 0
}

export function formatPoolRecord(record: PoolGameRecord) {
  const parts = [record.correct, record.wrong]
  if (record.push) parts.push(record.push)
  parts.push(record.unpicked)
  return parts.join('–')
}

export function formatPoolRecordLabel(record: PoolGameRecord) {
  return `Pool ${formatPoolRecord(record)}`
}

export function formatPoolRecordDetail(record: PoolGameRecord) {
  const parts = [
    `${record.correct} correct`,
    `${record.wrong} wrong`,
  ]
  if (record.push) {
    parts.push(`${record.push} push${record.push === 1 ? '' : 'es'}`)
  }
  parts.push(`${record.unpicked} unpicked`)
  return parts.join(' · ')
}

export type PoolSideSplit = {
  home: number
  away: number
  unpicked: number
  picked: number
}

function emptySplit(): PoolSideSplit {
  return { home: 0, away: 0, unpicked: 0, picked: 0 }
}

function tallySide(split: PoolSideSplit, pick: PlayerPick | undefined) {
  if (!pick || pick.matchStatus === 'unpicked' || !pick.pickedSide) {
    split.unpicked += 1
    return
  }
  if (pick.pickedSide === 'home') split.home += 1
  else split.away += 1
  split.picked += 1
}

/** Actual home/away cards for one slate game, once GrokBot has sides. */
export function poolSideSplitForGame(
  history: PlayerHistory,
  week: number,
  cbsEventId: number,
  seasonYear = history.pool.seasonYear,
  excludeEntryId?: string | null,
): PoolSideSplit | null {
  const weekRow = weekForGame(history, week, seasonYear)
  if (!weekRow) return null
  const split = emptySplit()
  for (const entry of entriesForField(weekRow.entries, excludeEntryId)) {
    tallySide(
      split,
      entry.picks.find((pick) => pick.cbsEventId === cbsEventId),
    )
  }
  return split
}

export function poolSideSplitsForWeek(
  history: PlayerHistory,
  week: number,
  seasonYear = history.pool.seasonYear,
  excludeEntryId?: string | null,
): Map<number, PoolSideSplit> {
  const weekRow = weekForGame(history, week, seasonYear)
  const splits = new Map<number, PoolSideSplit>()
  if (!weekRow) return splits
  const entries = entriesForField(weekRow.entries, excludeEntryId)

  const eventIds = new Set<number>()
  for (const entry of entries) {
    for (const pick of entry.picks) eventIds.add(pick.cbsEventId)
  }
  for (const cbsEventId of eventIds) {
    const split = emptySplit()
    for (const entry of entries) {
      tallySide(
        split,
        entry.picks.find((pick) => pick.cbsEventId === cbsEventId),
      )
    }
    splits.set(cbsEventId, split)
  }
  return splits
}
