import assert from 'node:assert/strict'
import test from 'node:test'
import {
  firstTeamPlayersFromDepthChart,
  nflAvailabilityTier,
  starterInjuriesForTeam,
} from '../src/nflStarterInjuries.ts'

const depthChart = {
  depthchart: [
    {
      name: 'Offense',
      positions: {
        qb: {
          position: { abbreviation: 'QB' },
          athletes: [
            { id: '1', displayName: 'Starter Quarterback' },
            { id: '2', displayName: 'Backup Quarterback' },
          ],
        },
        wr: {
          position: { abbreviation: 'WR' },
          athletes: [{ id: '3', displayName: 'Starting Receiver' }],
        },
      },
    },
  ],
}

function injury(
  id: string,
  name: string,
  status: string,
  position: string,
) {
  return {
    status,
    date: '2026-09-17T12:00:00Z',
    shortComment: `${name} update`,
    athlete: {
      displayName: name,
      position: { abbreviation: position },
      links: [
        {
          href: `https://www.espn.com/nfl/player/_/id/${id}/${name}`,
        },
      ],
    },
    details: { type: 'Knee' },
  }
}

test('firstTeamPlayersFromDepthChart only takes the first player at a position', () => {
  const starters = firstTeamPlayersFromDepthChart(depthChart)
  assert.equal(starters.size, 2)
  assert.equal(starters.get('id:1')?.position, 'QB')
  assert.equal(starters.has('id:2'), false)
})

test('starterInjuriesForTeam joins ESPN links and drops injured backups', () => {
  const injuries = starterInjuriesForTeam(
    [
      injury('1', 'Starter Quarterback', 'Out', 'QB'),
      injury('2', 'Backup Quarterback', 'Questionable', 'QB'),
      injury('3', 'Starting Receiver', 'Questionable', 'WR'),
    ],
    depthChart,
  )
  assert.deepEqual(
    injuries.map(({ name, position, tier }) => ({ name, position, tier })),
    [
      { name: 'Starter Quarterback', position: 'QB', tier: 'out' },
      { name: 'Starting Receiver', position: 'WR', tier: 'questionable' },
    ],
  )
})

test('availability tiers keep unavailable and reserve statuses distinct', () => {
  assert.equal(nflAvailabilityTier('Out'), 'out')
  assert.equal(nflAvailabilityTier('Doubtful'), 'doubtful')
  assert.equal(nflAvailabilityTier('Questionable'), 'questionable')
  assert.equal(nflAvailabilityTier('Injured Reserve'), 'reserve')
  assert.equal(nflAvailabilityTier('Physically Unable to Perform'), 'reserve')
  assert.equal(nflAvailabilityTier('Healthy'), null)
})
