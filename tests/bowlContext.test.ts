import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coachesFromCfbd,
  emptyCoachingSnapshot,
  staffChangesFromCoachSnapshots,
} from '../src/bowlContext.ts'

test('parses CFBD coaches for the requested season', () => {
  const rows = coachesFromCfbd(
    [
      {
        firstName: 'Kalen',
        lastName: 'DeBoer',
        hireDate: '2024-01-12',
        seasons: [
          { school: 'Washington', year: 2023 },
          { school: 'Alabama', year: 2026 },
        ],
      },
      {
        first_name: 'Kirby',
        last_name: 'Smart',
        school: 'Georgia',
        year: 2026,
        seasons: [{ school: 'Georgia', year: 2026 }],
      },
    ],
    2026,
  )
  assert.deepEqual(
    rows.map((row) => `${row.school}:${row.lastName}`),
    ['Alabama:DeBoer', 'Georgia:Smart'],
  )
})

test('first snapshot is a baseline and does not invent turnover', () => {
  const next = {
    ...emptyCoachingSnapshot(2026),
    updatedAt: '2026-10-05T00:00:00.000Z',
    coaches: [
      { school: 'Alabama', firstName: 'Kalen', lastName: 'DeBoer', hireDate: null },
    ],
  }
  assert.deepEqual(staffChangesFromCoachSnapshots(null, next), [])
  assert.deepEqual(
    staffChangesFromCoachSnapshots(emptyCoachingSnapshot(2026), next),
    [],
  )
})

test('a new head coach at the same school is a departed + hired pair', () => {
  const previous = {
    seasonYear: 2026,
    updatedAt: '2026-10-01T00:00:00.000Z',
    coaches: [
      { school: 'Florida', firstName: 'Billy', lastName: 'Napier', hireDate: null },
    ],
  }
  const next = {
    seasonYear: 2026,
    updatedAt: '2026-12-01T00:00:00.000Z',
    coaches: [
      { school: 'Florida', firstName: 'Lane', lastName: 'Kiffin', hireDate: '2026-11-30' },
    ],
  }
  const changes = staffChangesFromCoachSnapshots(previous, next)
  assert.deepEqual(
    changes.map((row) => [row.change, row.person, row.team]),
    [
      ['departed', 'Billy Napier', 'Florida'],
      ['hired', 'Lane Kiffin', 'Florida'],
    ],
  )
})
