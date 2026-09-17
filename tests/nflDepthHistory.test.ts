import assert from 'node:assert/strict'
import test from 'node:test'
import {
  priorFirstTeamPlayers,
  updateNflDepthHistory,
} from '../src/nflDepthHistory.ts'

function depth(firstId: string, firstName: string, secondId?: string) {
  return {
    depthchart: [
      {
        positions: {
          qb: {
            position: { abbreviation: 'QB' },
            athletes: [
              { id: firstId, displayName: firstName },
              ...(secondId
                ? [{ id: secondId, displayName: `Player ${secondId}` }]
                : []),
            ],
          },
        },
      },
    ],
  }
}

test('depth history appends only when first team changes', () => {
  const first = updateNflDepthHistory({
    previous: null,
    week: 3,
    seasonYear: 2026,
    label: 'Week 3',
    pulledAt: '2026-09-15T12:00:00Z',
    pulls: [
      {
        abbrev: 'DET',
        name: 'Detroit',
        depthChart: depth('1', 'Original Starter', '2'),
      },
    ],
  })
  const unchanged = updateNflDepthHistory({
    previous: first,
    week: 3,
    seasonYear: 2026,
    label: 'Week 3',
    pulledAt: '2026-09-15T13:00:00Z',
    pulls: [
      {
        abbrev: 'DET',
        name: 'Detroit',
        depthChart: depth('1', 'Original Starter', '2'),
      },
    ],
  })
  const reordered = updateNflDepthHistory({
    previous: unchanged,
    week: 3,
    seasonYear: 2026,
    label: 'Week 3',
    pulledAt: '2026-09-16T20:00:00Z',
    pulls: [
      {
        abbrev: 'DET',
        name: 'Detroit',
        depthChart: depth('2', 'Player 2', '1'),
      },
    ],
  })

  assert.equal(unchanged, first)
  assert.equal(reordered.teams[0].snapshots.length, 2)
  assert.deepEqual(
    priorFirstTeamPlayers(reordered, 'DET').map((player) => player.athleteId),
    ['1', '2'],
  )
})

test('a new pool week drops old depth snapshots', () => {
  const first = updateNflDepthHistory({
    previous: null,
    week: 3,
    seasonYear: 2026,
    label: 'Week 3',
    pulledAt: '2026-09-15T12:00:00Z',
    pulls: [
      {
        abbrev: 'DET',
        name: 'Detroit',
        depthChart: depth('1', 'Old Starter'),
      },
    ],
  })
  const next = updateNflDepthHistory({
    previous: first,
    week: 4,
    seasonYear: 2026,
    label: 'Week 4',
    pulledAt: '2026-09-22T12:00:00Z',
    pulls: [
      {
        abbrev: 'DET',
        name: 'Detroit',
        depthChart: depth('2', 'New Starter'),
      },
    ],
  })

  assert.equal(next.teams[0].snapshots.length, 1)
  assert.deepEqual(
    priorFirstTeamPlayers(next, 'DET').map((player) => player.athleteId),
    ['2'],
  )
})
