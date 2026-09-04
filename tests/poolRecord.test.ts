import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPoolRecord,
  formatPoolRecordDetail,
  formatPoolRecordLabel,
  poolRecordForGame,
  poolRecordIsGraded,
  poolRecordsForWeek,
} from '../src/poolRecord.ts'
import type { PlayerHistory, PlayerPick, PlayerWeekEntry } from '../src/types.ts'

function pick(
  overrides: Partial<PlayerPick> & Pick<PlayerPick, 'cbsEventId'>,
): PlayerPick {
  return {
    gameId: `game-${overrides.cbsEventId}`,
    sport: 'NCAAF',
    away: 'COLO',
    home: 'GATECH',
    homeSpread: -6.5,
    pickedTeamId: null,
    pickedTeam: null,
    pickedSide: null,
    result: null,
    points: null,
    pickStatus: 'NONE',
    matchStatus: 'unpicked',
    ...overrides,
  }
}

function entry(id: string, picks: PlayerPick[]): PlayerWeekEntry {
  return {
    entryId: id,
    name: id,
    weekScore: null,
    weekRank: null,
    correctPicks: null,
    picksCount: null,
    tiebreaker: { question: null, answer: null },
    picks,
  }
}

function history(entries: PlayerWeekEntry[]): PlayerHistory {
  return {
    source: { fetchedAt: '2026-09-04T08:00:00Z', timezone: 'America/Indianapolis' },
    pool: { name: 'Test', seasonYear: 2026 },
    entries: [],
    weeks: [
      {
        week: 1,
        seasonYear: 2026,
        periodId: 'w1',
        label: 'Week 1',
        status: 'in_progress',
        scored: false,
        slateFile: 'week1.json',
        entries,
      },
    ],
  }
}

const covered = history([
  entry('a', [
    pick({
      cbsEventId: 46,
      pickedSide: 'away',
      result: 'win',
      pickStatus: 'CORRECT',
      matchStatus: 'matched',
    }),
  ]),
  entry('b', [
    pick({
      cbsEventId: 46,
      pickedSide: 'home',
      result: 'loss',
      pickStatus: 'INCORRECT',
      matchStatus: 'matched',
    }),
  ]),
  entry('c', [
    pick({
      cbsEventId: 46,
      pickedSide: 'home',
      result: 'loss',
      pickStatus: 'INCORRECT',
      matchStatus: 'matched',
    }),
  ]),
  entry('d', [pick({ cbsEventId: 46 })]),
])

test('poolRecordForGame counts correct, wrong, and unpicked', () => {
  const record = poolRecordForGame(covered, 1, 46)
  assert.deepEqual(record, {
    correct: 1,
    wrong: 2,
    push: 0,
    unpicked: 1,
    pending: 0,
  })
  assert.equal(poolRecordIsGraded(record), true)
  assert.equal(formatPoolRecord(record!), '1–2–1')
  assert.equal(formatPoolRecordLabel(record!), 'Pool 1–2–1')
  assert.equal(
    formatPoolRecordDetail(record!),
    '1 correct · 2 wrong · 1 unpicked',
  )
})

test('poolRecordForGame inserts pushes before unpicked', () => {
  const record = poolRecordForGame(
    history([
      entry('a', [
        pick({
          cbsEventId: 1,
          pickedSide: 'home',
          result: 'push',
          matchStatus: 'matched',
        }),
      ]),
      entry('b', [
        pick({
          cbsEventId: 1,
          pickedSide: 'away',
          result: 'win',
          matchStatus: 'matched',
        }),
      ]),
      entry('c', [pick({ cbsEventId: 1 })]),
    ]),
    1,
    1,
  )
  assert.deepEqual(record, {
    correct: 1,
    wrong: 0,
    push: 1,
    unpicked: 1,
    pending: 0,
  })
  assert.equal(formatPoolRecord(record!), '1–0–1–1')
  assert.equal(
    formatPoolRecordDetail(record!),
    '1 correct · 0 wrong · 1 push · 1 unpicked',
  )
})

test('poolRecordsForWeek stays quiet until a pick is graded', () => {
  const records = poolRecordsForWeek(
    history([
      entry('a', [
        pick({
          cbsEventId: 2,
          pickedSide: 'home',
          matchStatus: 'matched',
        }),
      ]),
      entry('b', [pick({ cbsEventId: 2 })]),
    ]),
    1,
  )
  const record = records.get(2)
  assert.equal(record?.pending, 1)
  assert.equal(record?.unpicked, 1)
  assert.equal(poolRecordIsGraded(record), false)
})
