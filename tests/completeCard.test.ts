import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCompleteCardPayload } from '../src/completeCard.ts'
import type { SuggestedCard } from '../src/cardStrategy.ts'

const card: SuggestedCard = {
  strategyId: 'v6-line-rest-travel',
  generatedAt: '2026-09-09T19:00:00.000Z',
  seasonYear: 2026,
  week: 2,
  weekLabel: 'Week 2',
  picks: [
    {
      gameId: 'recommended',
      cbsEventId: 1,
      away: 'Away',
      awayId: 'away-id',
      home: 'Home',
      homeId: 'home-id',
      kickoff: '2026-09-10T20:00:00-04:00',
      kickoffLabel: 'Thu 8:00 PM',
      pickedSide: 'home',
      pickedTeamId: 'home-id',
      pickedTeam: 'Home',
      poolSpread: -3,
      source: 'line-value',
      category: 'lean',
      edge: 2,
      strength: 'solid',
      hook: null,
      publicSupport: 'none',
      publicPct: null,
      score: 8,
      compositeEdge: 2,
      detail: '2-point line value',
    },
  ],
  unpicked: [
    {
      gameId: 'manual',
      cbsEventId: 2,
      away: 'Manual Away',
      awayId: 'manual-away-id',
      home: 'Manual Home',
      homeId: 'manual-home-id',
      homeSpread: -1.5,
      kickoffLabel: 'Sun 1:00 PM',
      reason: 'No line-value, rest, or travel advantage',
    },
    {
      gameId: 'untouched',
      cbsEventId: 3,
      away: 'Other Away',
      awayId: 'other-away-id',
      home: 'Other Home',
      homeId: 'other-home-id',
      homeSpread: 2.5,
      kickoffLabel: 'Sun 4:00 PM',
      reason: 'No line-value, rest, or travel advantage',
    },
  ],
  tiebreaker: null,
}

test('completion payload includes selected manual picks only', () => {
  const payload = buildCompleteCardPayload(
    card,
    new Set(),
    null,
    new Map([['manual', 'away']]),
  )

  assert.deepEqual(payload.picks, [
    {
      gameId: 'recommended',
      pickedTeamId: 'home-id',
      pickedSide: 'home',
      deviate: false,
    },
    {
      gameId: 'manual',
      pickedTeamId: 'manual-away-id',
      pickedSide: 'away',
      deviate: false,
      manual: true,
    },
  ])
})

test('manual selection can choose the home side', () => {
  const payload = buildCompleteCardPayload(
    { ...card, picks: [] },
    new Set(),
    null,
    new Map([['manual', 'home']]),
  )

  assert.equal(payload.picks[0]?.pickedTeamId, 'manual-home-id')
  assert.equal(payload.picks[0]?.pickedSide, 'home')
  assert.equal((payload.picks[0] as { manual?: boolean })?.manual, true)
})
