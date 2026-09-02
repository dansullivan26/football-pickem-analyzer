import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attachFrozenRanks,
  cbsTeamRank,
  formatRankStamp,
  formatRankTrail,
  frozenRanksCaptured,
} from '../src/teamRanks.ts'

test('cbsTeamRank only keeps a numeric CBS rank', () => {
  assert.equal(cbsTeamRank({ rank: 7 }), 7)
  assert.equal(cbsTeamRank({ rank: null }), null)
  assert.equal(cbsTeamRank({}), null)
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

test('formatRankTrail skips weeks we never stamped', () => {
  assert.equal(formatRankStamp(7), '#7')
  assert.equal(formatRankStamp(null), 'unranked')
  assert.equal(formatRankStamp(undefined), null)
  assert.equal(formatRankTrail([7, undefined, null, 5]), '#7 → unranked → #5')
  assert.equal(formatRankTrail([undefined]), null)
})
