import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dismissHeadsUpFlips,
  headsUpFlipsWereDismissed,
  sentRecFlipSignature,
  sentRecommendationFlips,
} from '../src/sentRecFlips.ts'
import type { SuggestedPick } from '../src/cardStrategy.ts'
import type { SlateGame } from '../src/types.ts'

const now = Date.parse('2026-09-26T12:00:00-04:00')

function game(
  overrides: Partial<SlateGame> & Pick<SlateGame, 'id' | 'kickoff'>,
): SlateGame {
  return {
    cbsEventId: Number(overrides.id.replace(/\D/g, '') || 1),
    sport: 'NCAAF',
    week: 4,
    status: 'SCHEDULED',
    kickoffLabel: 'Sat 3:30 PM',
    tv: null,
    away: {
      id: 'away',
      abbrev: 'AWAY',
      name: 'Away',
      nickname: 'Away',
      location: 'Away',
      conference: '',
      record: '',
      rank: null,
      pickemPctStraightUp: 0,
      pickemPctAgainstSpread: 0,
    },
    home: {
      id: 'home',
      abbrev: 'HOME',
      name: 'Home',
      nickname: 'Home',
      location: 'Home',
      conference: '',
      record: '',
      rank: null,
      pickemPctStraightUp: 0,
      pickemPctAgainstSpread: 0,
    },
    homeSpread: -3,
    line: 'Home -3',
    ...overrides,
  }
}

function pick(
  overrides: Partial<SuggestedPick> & Pick<SuggestedPick, 'gameId' | 'pickedSide'>,
): SuggestedPick {
  return {
    cbsEventId: 1,
    away: 'Away',
    awayAbbrev: 'AWAY',
    awayId: 'away',
    home: 'Home',
    homeAbbrev: 'HOME',
    homeId: 'home',
    kickoff: '2026-09-26T15:30:00-04:00',
    kickoffLabel: 'Sat 3:30 PM',
    pickedTeamId: overrides.pickedSide === 'away' ? 'away' : 'home',
    pickedTeam: overrides.pickedSide === 'away' ? 'Away' : 'Home',
    poolSpread: overrides.pickedSide === 'away' ? 3 : -3,
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
    ...overrides,
  }
}

test('sentRecommendationFlips names an opposite live rec before kickoff', () => {
  const flips = sentRecommendationFlips(
    [
      game({
        id: 'txam',
        kickoff: '2026-09-26T15:30:00-04:00',
        away: {
          ...game({ id: 'txam', kickoff: '2026-09-26T15:30:00-04:00' }).away,
          name: 'Texas A&M',
        },
        home: {
          ...game({ id: 'txam', kickoff: '2026-09-26T15:30:00-04:00' }).home,
          name: 'LSU',
        },
        homeSpread: -10.5,
      }),
    ],
    [{ gameId: 'txam', pickedSide: 'away' }],
    [pick({ gameId: 'txam', pickedSide: 'home' })],
    now,
  )
  assert.equal(flips.length, 1)
  assert.equal(flips[0]?.sentLine, 'Texas A&M +10.5')
  assert.equal(flips[0]?.nowLine, 'LSU -10.5')
})

test('sentRecommendationFlips ignores matching sides, kicked-off games, and old deviate-only rows', () => {
  const flips = sentRecommendationFlips(
    [
      game({ id: 'same', kickoff: '2026-09-26T15:30:00-04:00' }),
      game({ id: 'done', kickoff: '2026-09-25T19:00:00-04:00' }),
      game({ id: 'legacy', kickoff: '2026-09-26T19:00:00-04:00' }),
    ],
    [
      { gameId: 'same', pickedSide: 'home' },
      { gameId: 'done', pickedSide: 'away' },
      { gameId: 'legacy', deviate: true },
    ],
    [
      pick({ gameId: 'same', pickedSide: 'home' }),
      pick({ gameId: 'done', pickedSide: 'home' }),
      pick({ gameId: 'legacy', pickedSide: 'away' }),
    ],
    now,
  )
  assert.deepEqual(flips, [])
})

test('heads-up dismiss sticks for the current flip set only', () => {
  const storage = new Map<string, string>()
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
  }
  const flips = sentRecommendationFlips(
    [game({ id: 'txam', kickoff: '2026-09-26T15:30:00-04:00' })],
    [{ gameId: 'txam', pickedSide: 'away' }],
    [pick({ gameId: 'txam', pickedSide: 'home' })],
    now,
  )
  assert.equal(headsUpFlipsWereDismissed(2026, 4, flips, adapter), false)
  dismissHeadsUpFlips(2026, 4, flips, adapter)
  assert.equal(headsUpFlipsWereDismissed(2026, 4, flips, adapter), true)
  assert.equal(
    sentRecFlipSignature(flips),
    adapter.getItem('heads-up-flips:2026:4'),
  )
})
