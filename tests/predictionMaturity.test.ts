import assert from 'node:assert/strict'
import test from 'node:test'
import {
  completedForecastWeekCount,
  predictionMaturity,
  type PredictionForecastWeek,
} from '../src/playerPrediction.ts'
import type { PlayerWeek } from '../src/types.ts'

test('maturity requires both completed weeks and graded calls', () => {
  assert.equal(predictionMaturity(1, 500).key, 'early')
  assert.equal(predictionMaturity(6, 99).key, 'early')
  assert.equal(predictionMaturity(2, 100).key, 'developing')
  assert.equal(predictionMaturity(4, 300).key, 'established')
  assert.equal(predictionMaturity(6, 500).key, 'deeper')
})

test('the early message does not present a hot start as settled truth', () => {
  const maturity = predictionMaturity(0, 45)
  assert.equal(maturity.label, 'Very early read')
  assert.match(maturity.detail, /coin flip/)
  assert.match(maturity.detail, /too little is settled/)
})

function forecast(
  week: number,
  calls: number,
  strategyId = 'v1-habits',
): PredictionForecastWeek {
  return {
    week,
    seasonYear: 2026,
    label: `Week ${week}`,
    strategyId,
    capturedAt: '2026-09-01T00:00:00Z',
    frozenAt: '2026-09-01T00:00:00Z',
    trainingThroughWeek: week - 1,
    players: [
      {
        entryId: 'player',
        name: 'Player',
        archetype: 'Test',
        archetypeDetail: 'Test',
        priorPicks: 25,
        calls,
        games: [],
      },
    ],
  }
}

function historyWeek(week: number, scored: boolean): PlayerWeek {
  return {
    week,
    seasonYear: 2026,
    periodId: `week-${week}`,
    label: `Week ${week}`,
    status: scored ? 'scored' : 'in_progress',
    scored,
    slateFile: `week-${week}.json`,
    entries: [],
  }
}

test('only completed weeks with locked v1 calls count toward maturity', () => {
  const forecasts = [
    forecast(1, 0),
    forecast(2, 300),
    forecast(3, 300),
    forecast(4, 300, 'future-strategy'),
  ]
  const history = [
    historyWeek(1, true),
    historyWeek(2, true),
    historyWeek(3, false),
    historyWeek(4, true),
  ]

  assert.equal(completedForecastWeekCount(forecasts, history, 2026), 1)
})
