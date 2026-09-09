import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSuggestedCard } from '../src/cardStrategy.ts'
import type { GameAnalysis, SlateGame, Team } from '../src/types.ts'

function team(abbrev: string): Team {
  return {
    id: `${abbrev}-id`,
    abbrev,
    name: abbrev,
    nickname: abbrev,
    location: abbrev,
    conference: 'Conf',
    record: '0-0',
    rank: null,
    pickemPctStraightUp: 50,
    pickemPctAgainstSpread: 50,
  }
}

function analysis(sportWeek: number): GameAnalysis {
  const game: SlateGame = {
    id: 'game-id',
    cbsEventId: 50029202,
    sport: 'NFL',
    week: sportWeek,
    status: 'SCHEDULED',
    kickoff: '2026-09-10T20:20:00-04:00',
    kickoffLabel: 'Thu 8:20 PM ET',
    tv: null,
    away: team('NE'),
    home: team('SEA'),
    homeSpread: -3.5,
    line: 'SEA -3.5',
  }

  return {
    game,
    odds: undefined,
    consensus: undefined,
    liveHomeSpread: -5.5,
    edge: 2,
    category: 'lean',
    recommendedSide: 'home',
  }
}

test('the card carries the pool week, not the sport week on the game', () => {
  const card = generateSuggestedCard(
    [analysis(1)],
    { order: 2, label: 'Week 2' },
    2026,
    null,
  )

  assert.equal(card.week, 2)
  assert.equal(card.weekLabel, 'Week 2')
  assert.equal(card.picks.length, 1)
})

test('an empty card still reports the pool week', () => {
  const card = generateSuggestedCard([], { order: 7, label: 'Week 7' }, 2026, null)

  assert.equal(card.week, 7)
  assert.equal(card.weekLabel, 'Week 7')
})
