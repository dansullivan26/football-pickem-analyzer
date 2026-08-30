import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ourPickForGame,
  ourPoolPickOnSide,
  ourRosterEntry,
} from '../src/ourEntry.ts'
import type { PlayerHistory, PlayerPick } from '../src/types.ts'

function pick(cbsEventId: number, side: 'home' | 'away'): PlayerPick {
  return {
    gameId: `g-${cbsEventId}`,
    cbsEventId,
    sport: 'NCAAF',
    away: 'Away',
    home: 'Home',
    homeSpread: -3,
    pickedTeamId: side,
    pickedTeam: side === 'home' ? 'Home' : 'Away',
    pickedSide: side,
    result: 'win',
    points: 1,
    pickStatus: 'CORRECT',
    matchStatus: 'matched',
  }
}

function history(names: string[]): PlayerHistory {
  return {
    source: { fetchedAt: '2026-08-30T00:00:00Z', timezone: 'America/New_York' },
    pool: { name: 'Test', seasonYear: 2026 },
    entries: names.map((name, index) => ({
      entryId: `id-${index}`,
      name,
      hasMadeAPick: true,
      season: {
        score: null,
        rank: null,
        correctPicks: null,
        picksMadeCount: null,
      },
    })),
    weeks: [
      {
        week: 1,
        seasonYear: 2026,
        periodId: '1',
        label: 'Week 1',
        status: 'scored',
        scored: true,
        slateFile: 'w1.json',
        entries: names.map((name, index) => ({
          entryId: `id-${index}`,
          name,
          weekScore: null,
          weekRank: null,
          correctPicks: null,
          picksCount: null,
          tiebreaker: { question: null, answer: null },
          picks: index === 0 ? [pick(100, 'home')] : [],
        })),
      },
    ],
  }
}

test('ourRosterEntry finds the unique Dan Sullivan row', () => {
  const found = ourRosterEntry(history(['Dan Sullivan', 'Alec Bone']))
  assert.equal(found?.entryId, 'id-0')
  assert.equal(ourRosterEntry(history(['Dan Baker'])), null)
})

test('ourPickForGame reads that entry’s pick for the slate week', () => {
  const row = ourPickForGame(history(['Dan Sullivan']), 1, 100)
  assert.equal(row?.pickedSide, 'home')
  assert.equal(ourPickForGame(history(['Dan Sullivan']), 1, 999), null)
})

test('ourPoolPickOnSide marks the pool team we took, not the opponent', () => {
  const dump = history(['Dan Sullivan'])
  assert.equal(ourPoolPickOnSide(dump, 1, 100, 'home'), 'picked')
  assert.equal(ourPoolPickOnSide(dump, 1, 100, 'away'), 'not-picked')
  assert.equal(ourPoolPickOnSide(dump, 1, 999, 'home'), null)
})
