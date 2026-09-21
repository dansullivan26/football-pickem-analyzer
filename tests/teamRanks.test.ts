import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attachFrozenRanks,
  cbsTeamRank,
  formatRankStamp,
  formatRankTrail,
  formatRankWeek,
  frozenRanksCaptured,
} from '../src/teamRanks.ts'

test('cbsTeamRank only keeps a numeric CBS rank', () => {
  assert.equal(cbsTeamRank({ rank: 7 }), 7)
  assert.equal(cbsTeamRank({ rank: null }), null)
  assert.equal(cbsTeamRank({}), null)
  assert.equal(cbsTeamRank({ rank: 3 }, 'NFL'), null)
  assert.equal(cbsTeamRank({ rank: 3 }, 'NCAAF'), 3)
})

test('attachFrozenRanks writes slate ranks and then locks them', () => {
  const first = attachFrozenRanks({}, { away: { rank: 7 }, home: { rank: null } })
  assert.deepEqual(first, { awayRank: 7, homeRank: null })
  assert.equal(frozenRanksCaptured(first), true)

  const moved = attachFrozenRanks(
    first,
    { away: { rank: 4 }, home: { rank: 12 } },
    true,
  )
  assert.deepEqual(moved, first)

  const open = attachFrozenRanks(
    first,
    { away: { rank: 4 }, home: { rank: 12 } },
    false,
  )
  assert.deepEqual(open, { awayRank: 4, homeRank: 12 })
})

test('attachFrozenRanks does not stamp NFL power ranks as CBS ranks', () => {
  const stamped = attachFrozenRanks(
    {},
    {
      sport: 'NFL',
      away: { rank: 12 },
      home: { rank: 3 },
    },
  )
  assert.deepEqual(stamped, { awayRank: null, homeRank: null })
})

test('formatRankTrail skips weeks we never stamped', () => {
  assert.equal(formatRankStamp(7), '#7')
  assert.equal(formatRankStamp(null), null)
  assert.equal(formatRankStamp(null, true), 'unranked')
  assert.equal(formatRankStamp(undefined), null)
  assert.equal(
    formatRankTrail([
      { rank: 7 },
      { rank: undefined },
      { rank: null },
      { rank: 5 },
    ]),
    '#7 → unranked → #5',
  )
  assert.equal(formatRankTrail([{ rank: undefined }]), null)
})

test('formatRankTrail omits unranked unless the team was ranked once', () => {
  assert.equal(formatRankTrail([{ rank: null }, { rank: null }]), null)
  assert.equal(
    formatRankTrail([{ rank: null }, { rank: 7 }, { rank: null }]),
    'unranked → #7 → unranked',
  )
})

test('formatRankWeek prefers the pool week number', () => {
  assert.equal(formatRankWeek(3, 'Week 3'), 'W3')
  assert.equal(formatRankWeek(undefined, 'Week 12'), 'W12')
  assert.equal(formatRankWeek(undefined, 'Bowl'), 'Bowl')
  assert.equal(formatRankWeek(), null)
})

test('formatRankTrail notes the week each rank was held', () => {
  assert.equal(
    formatRankTrail([
      { rank: 13, week: 1, weekLabel: 'Week 1' },
      { rank: 12, week: 2, weekLabel: 'Week 2' },
      { rank: 10, week: 4, weekLabel: 'Week 4' },
    ]),
    '#13 (W1) → #12 (W2) → #10 (W4)',
  )
  assert.equal(
    formatRankTrail([
      { rank: null, week: 1 },
      { rank: 7, week: 3 },
      { rank: null, week: 8 },
    ]),
    'unranked (W1) → #7 (W3) → unranked (W8)',
  )
})
