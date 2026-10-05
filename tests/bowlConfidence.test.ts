import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXAMPLE_BOWL_GAMES,
  bowlConfidencePoints,
  compareBowlRank,
  favoriteLineLabel,
  rankBowlConfidence,
  straightUpPick,
} from '../src/bowlConfidence.ts'
import { emptyBowlSide, type BowlGame } from '../src/bowlPickem.ts'

function game(extras: Partial<BowlGame> & Pick<BowlGame, 'id'>): BowlGame {
  return {
    providerEventId: null,
    bowlName: null,
    kickoff: null,
    away: emptyBowlSide('Away'),
    home: emptyBowlSide('Home'),
    homeSpread: null,
    spreadUpdatedAt: null,
    ...extras,
  }
}

test('ranks by absolute spread, biggest favorite first', () => {
  const rows = rankBowlConfidence([
    game({
      id: 'coin',
      away: emptyBowlSide('Toss-up'),
      home: emptyBowlSide('Even'),
      homeSpread: 0,
    }),
    game({
      id: 'lock',
      away: emptyBowlSide('Dog'),
      home: emptyBowlSide('Lock U'),
      homeSpread: -14.5,
    }),
    game({
      id: 'lean',
      away: emptyBowlSide('Visitor'),
      home: emptyBowlSide('Lean State'),
      homeSpread: 3,
    }),
  ])

  assert.deepEqual(
    rows.map((row) => [row.game.id, row.confidence, row.pickName]),
    [
      ['lock', 3, 'Lock U'],
      ['lean', 2, 'Visitor'],
      ['coin', 1, null],
    ],
  )
  assert.equal(bowlConfidencePoints(3), 6)
})

test('unpriced games keep a slot under every priced game', () => {
  const rows = rankBowlConfidence([
    game({
      id: 'tba',
      away: emptyBowlSide('Later'),
      home: emptyBowlSide('Pending'),
      homeSpread: null,
    }),
    game({
      id: 'priced',
      away: emptyBowlSide('Road'),
      home: emptyBowlSide('Fav'),
      homeSpread: -2.5,
    }),
  ])
  assert.equal(rows[0]?.game.id, 'priced')
  assert.equal(rows[0]?.confidence, 2)
  assert.equal(rows[1]?.game.id, 'tba')
  assert.equal(rows[1]?.confidence, 1)
  assert.equal(rows[1]?.priced, false)
})

test('tied spreads break toward the earlier kickoff', () => {
  const later = game({
    id: 'later',
    away: emptyBowlSide('B'),
    home: emptyBowlSide('A'),
    homeSpread: -7,
    kickoff: '2026-12-28T20:00:00.000Z',
  })
  const earlier = game({
    id: 'earlier',
    away: emptyBowlSide('D'),
    home: emptyBowlSide('C'),
    homeSpread: -7,
    kickoff: '2026-12-26T17:00:00.000Z',
  })
  assert.ok(compareBowlRank(earlier, later) < 0)
  assert.equal(rankBowlConfidence([later, earlier])[0]?.game.id, 'earlier')
})

test('straight-up pick is the favorite, not the home side', () => {
  assert.deepEqual(
    straightUpPick(
      game({
        id: 'road-fav',
        away: emptyBowlSide('Road Fav'),
        home: emptyBowlSide('Home Dog'),
        homeSpread: 10,
      }),
    ),
    { pickSide: 'away', pickName: 'Road Fav' },
  )
  assert.equal(
    favoriteLineLabel(
      rankBowlConfidence([
        game({
          id: 'road-fav',
          away: emptyBowlSide('Road Fav'),
          home: emptyBowlSide('Home Dog'),
          homeSpread: 10,
        }),
      ])[0]!,
    ),
    'Road Fav -10',
  )
})

test('example card is a 4-down-to-1 walkthrough', () => {
  const rows = rankBowlConfidence(EXAMPLE_BOWL_GAMES)
  assert.deepEqual(
    rows.map((row) => [row.confidence, row.game.bowlName, row.pickName]),
    [
      [4, 'Example Bowl', 'Example University'],
      [3, 'Demo Bowl', 'Demo Tech'],
      [2, 'Fixture Bowl', 'Mock State'],
      [1, 'Coin Flip Classic', null],
    ],
  )
})
