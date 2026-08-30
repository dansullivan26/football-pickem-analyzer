import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeCareerHistory,
  upsertSeasonWeek,
  weekIsBefore,
} from '../src/careerHistory.ts'
import type { PlayerHistory, PlayerWeek } from '../src/types.ts'

function week(
  seasonYear: number,
  number: number,
  scored = true,
): PlayerWeek {
  return {
    week: number,
    seasonYear,
    periodId: `${seasonYear}-${number}`,
    label: `Week ${number}`,
    status: scored ? 'scored' : 'upcoming',
    scored,
    slateFile: `${seasonYear}-${number}.json`,
    entries: [],
  }
}

function history(seasonYear: number, weeks: PlayerWeek[]): PlayerHistory {
  return {
    source: { fetchedAt: '2027-01-01T00:00:00Z', timezone: 'America/New_York' },
    pool: { name: 'Test', seasonYear },
    entries: [],
    weeks,
  }
}

test('weekIsBefore treats a prior season as earlier than week 1', () => {
  assert.equal(weekIsBefore({ week: 15, seasonYear: 2026 }, 1, 2027, 2027), true)
  assert.equal(weekIsBefore({ week: 1, seasonYear: 2027 }, 1, 2027, 2027), false)
  assert.equal(weekIsBefore({ week: 2 }, 3, 2026, 2026), true)
})

test('upsertSeasonWeek keeps last year when week numbers collide', () => {
  const weeks = upsertSeasonWeek(
    [
      { week: 1, seasonYear: 2026, label: '2026 W1' },
      { week: 2, seasonYear: 2026, label: '2026 W2' },
    ],
    { week: 1, label: '2027 W1' },
    2027,
  )
  assert.deepEqual(
    weeks.map((row) => `${row.seasonYear}:${row.week}:${row.label}`),
    ['2026:1:2026 W1', '2026:2:2026 W2', '2027:1:2027 W1'],
  )
})

test('mergeCareerHistory appends archived weeks ahead of the current season', () => {
  const merged = mergeCareerHistory(history(2027, [week(2027, 1, false)]), [
    history(2026, [week(2026, 1), week(2026, 2)]),
  ])
  assert.deepEqual(
    merged.weeks.map((row) => `${row.seasonYear}:${row.week}`),
    ['2026:1', '2026:2', '2027:1'],
  )
})
