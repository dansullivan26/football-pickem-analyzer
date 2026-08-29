import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCoversToRecommendations,
  coverFromPlayerPick,
  coversFromPlayerHistory,
  lookupCover,
} from '../src/coverResults.ts'
import type {
  PlayerHistory,
  PlayerPick,
  RecommendationHistory,
} from '../src/types.ts'

function pick(
  overrides: Partial<PlayerPick> & Pick<PlayerPick, 'cbsEventId'>,
): PlayerPick {
  return {
    gameId: `game-${overrides.cbsEventId}`,
    sport: 'NCAAF',
    away: 'UNC',
    home: 'TCU',
    homeSpread: -7.5,
    pickedTeamId: null,
    pickedTeam: null,
    pickedSide: null,
    result: null,
    points: null,
    pickStatus: null,
    matchStatus: 'unpicked',
    ...overrides,
  }
}

function history(picks: PlayerPick[]): PlayerHistory {
  return {
    source: { fetchedAt: '2026-08-29T17:00:00Z', timezone: 'America/Indianapolis' },
    pool: { name: 'Test', seasonYear: 2026 },
    entries: [],
    weeks: [
      {
        week: 1,
        periodId: 'w1',
        label: 'Week 1',
        status: 'in_progress',
        scored: false,
        slateFile: 'week1.json',
        entries: [
          {
            entryId: 'a',
            name: 'A',
            weekScore: null,
            weekRank: null,
            correctPicks: null,
            picksCount: null,
            tiebreaker: { question: null, answer: null },
            picks,
          },
        ],
      },
    ],
  }
}

test('a home win and an away loss both mean the home team covered', () => {
  assert.equal(coverFromPlayerPick('home', 'win'), 'home')
  assert.equal(coverFromPlayerPick('away', 'loss'), 'home')
  assert.equal(coverFromPlayerPick('away', 'win'), 'away')
  assert.equal(coverFromPlayerPick('home', 'loss'), 'away')
  assert.equal(coverFromPlayerPick('home', 'push'), 'push')
})

test('coversFromPlayerHistory stamps a game when graded picks agree', () => {
  const covers = coversFromPlayerHistory(
    history([
      pick({
        cbsEventId: 50027398,
        pickedSide: 'home',
        result: 'win',
        matchStatus: 'matched',
      }),
      pick({
        cbsEventId: 50027398,
        gameId: 'game-50027398-b',
        pickedSide: 'away',
        result: 'loss',
        matchStatus: 'matched',
      }),
      pick({ cbsEventId: 50027437 }),
    ]),
  )

  assert.equal(lookupCover(covers, 1, 50027398), 'home')
  assert.equal(lookupCover(covers, 1, 50027437), null)
})

test('coversFromPlayerHistory skips a game when graded picks disagree', () => {
  const covers = coversFromPlayerHistory(
    history([
      pick({
        cbsEventId: 50027398,
        pickedSide: 'home',
        result: 'win',
        matchStatus: 'matched',
      }),
      pick({
        cbsEventId: 50027398,
        gameId: 'game-50027398-b',
        pickedSide: 'home',
        result: 'loss',
        matchStatus: 'matched',
      }),
    ]),
  )

  assert.equal(lookupCover(covers, 1, 50027398), null)
})

test('applyCoversToRecommendations writes new covers and leaves the rest alone', () => {
  const recommendations: RecommendationHistory = {
    updatedAt: '2026-08-29T13:00:00.000Z',
    weeks: [
      {
        week: 1,
        label: 'Week 1',
        capturedAt: '2026-08-29T13:00:00.000Z',
        scored: false,
        games: [
          {
            cbsEventId: 50027398,
            sport: 'NCAAF',
            kickoff: '2026-08-29T12:00:00-04:00',
            away: 'UNC',
            home: 'TCU',
            homeSpread: -7.5,
            liveHomeSpread: -8.5,
            category: 'slight',
            recommendedSide: 'home',
            hook: null,
            cover: null,
            source: 'line-value',
            pickedSide: 'home',
            strength: 'mild',
            score: 3,
          },
          {
            cbsEventId: 50027437,
            sport: 'NCAAF',
            kickoff: '2026-08-29T19:00:00-04:00',
            away: 'HAWAII',
            home: 'STNFRD',
            homeSpread: -5.5,
            liveHomeSpread: -4,
            category: 'lean',
            recommendedSide: 'away',
            hook: null,
            cover: null,
            source: 'line-value',
            pickedSide: 'away',
            strength: 'solid',
            score: 9,
          },
        ],
      },
    ],
  }

  const covers = coversFromPlayerHistory(
    history([
      pick({
        cbsEventId: 50027398,
        pickedSide: 'home',
        result: 'win',
        matchStatus: 'matched',
      }),
    ]),
  )
  const { next, applied } = applyCoversToRecommendations(
    recommendations,
    covers,
    '2026-08-29T18:00:00.000Z',
  )

  assert.equal(applied, 1)
  assert.equal(next.weeks[0].games[0].cover, 'home')
  assert.equal(next.weeks[0].games[1].cover, null)
  assert.equal(next.updatedAt, '2026-08-29T18:00:00.000Z')
})
