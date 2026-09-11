import assert from 'node:assert/strict'
import test from 'node:test'
import {
  summarizePlayerPredictionResiduals,
  summarizePredictionResiduals,
  type PredictedGame,
  type PredictionForecastWeek,
  type PredictionForecasts,
} from '../src/playerPrediction.ts'

function game(
  id: number,
  predictedSide: 'home' | 'away' | null,
  correct: boolean | null,
): PredictedGame {
  return {
    cbsEventId: id,
    sport: id % 2 ? 'NFL' : 'NCAAF',
    away: 'AWAY',
    home: 'HOME',
    homeSpread: -3,
    predictedSide,
    predictedTeam: predictedSide === 'home' ? 'HOME' : predictedSide ? 'AWAY' : null,
    confidence: predictedSide ? 'medium' : null,
    habitKey: predictedSide ? 'favorite' : null,
    reason: predictedSide ? 'Favorite/dog habit' : 'No call',
    sampleSize: 20,
    actualSide: correct == null ? null : correct ? predictedSide : 'away',
    correct,
  }
}

function week(
  order: number,
  frozen: boolean,
  playerGames: PredictedGame[],
): PredictionForecastWeek {
  return {
    week: order,
    seasonYear: 2026,
    label: `Week ${order}`,
    strategyId: 'v1-habits',
    capturedAt: '2026-09-01T00:00:00Z',
    frozenAt: frozen ? '2026-09-01T00:00:00Z' : null,
    trainingThroughWeek: order - 1,
    players: [
      {
        entryId: 'target',
        name: 'Target',
        archetype: 'Favorite taker',
        archetypeDetail: 'Test',
        priorPicks: 25,
        calls: playerGames.filter((row) => row.predictedSide).length,
        games: playerGames,
      },
      {
        entryId: 'other',
        name: 'Other',
        archetype: 'Test',
        archetypeDetail: 'Test',
        priorPicks: 25,
        calls: 1,
        games: [game(99, 'home', true)],
      },
    ],
  }
}

const forecasts: PredictionForecasts = {
  updatedAt: '2026-09-11T00:00:00Z',
  weeks: [
    week(2, true, [
      game(1, 'home', true),
      game(2, 'home', false),
      game(3, null, null),
    ]),
    week(3, false, [game(4, 'home', true)]),
  ],
  residuals: null,
}

test('player residuals isolate one player and locked weeks', () => {
  const report = summarizePlayerPredictionResiduals(
    forecasts,
    'target',
    2026,
  )

  assert.equal(report?.overall.games, 3)
  assert.equal(report?.overall.calls, 2)
  assert.equal(report?.overall.graded, 2)
  assert.equal(report?.overall.correct, 1)
  assert.equal(report?.overall.accuracy, 0.5)
  assert.equal(report?.overall.noCallRate, 1 / 3)
})

test('pool residuals ignore forecasts that have not locked', () => {
  const report = summarizePredictionResiduals(
    forecasts.weeks,
    forecasts.updatedAt,
  )

  assert.equal(report?.overall.games, 4)
  assert.equal(report?.overall.graded, 3)
  assert.equal(report?.overall.correct, 2)
})

test('unknown players have no residual report', () => {
  assert.equal(
    summarizePlayerPredictionResiduals(forecasts, 'missing', 2026),
    null,
  )
})
