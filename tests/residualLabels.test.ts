import assert from 'node:assert/strict'
import test from 'node:test'
import {
  residualLabel,
  residualSliceCopy,
  type ResidualCell,
} from '../src/playerPrediction.ts'

function cell(partial: Partial<ResidualCell> & Pick<ResidualCell, 'key'>): ResidualCell {
  return {
    games: 0,
    calls: 0,
    graded: 0,
    correct: 0,
    noCalls: 0,
    accuracy: null,
    noCallRate: null,
    ...partial,
  }
}

test('the favorite key reads differently per group', () => {
  assert.equal(residualLabel('market', 'favorite'), 'Called the favorite')
  assert.equal(residualLabel('habit', 'favorite'), 'Favorite/dog habit')
})

test('every group names its no-call bucket', () => {
  for (const group of ['market', 'habit', 'confidence'] as const) {
    assert.equal(residualLabel(group, 'no-call'), 'No call made')
  }
})

test('league and confidence keys use reader-facing names', () => {
  assert.equal(residualLabel('league', 'NCAAF'), 'College')
  assert.equal(residualLabel('league', 'NFL'), 'NFL')
  assert.equal(residualLabel('confidence', 'high'), 'Deep sample')
  assert.equal(residualLabel('confidence', 'low'), 'Thin sample')
})

test('an unknown key falls back to itself rather than blank', () => {
  assert.equal(residualLabel('habit', 'brand-new-habit'), 'brand-new-habit')
})

test('scorecard tiles spell out player-games and graded vs calls', () => {
  const nfl = residualSliceCopy(
    'league',
    cell({
      key: 'NFL',
      games: 416,
      calls: 312,
      graded: 42,
      correct: 31,
      noCalls: 104,
      accuracy: 31 / 42,
      noCallRate: 104 / 416,
    }),
  )
  assert.match(nfl.line, /31 of 42 graded player-games/)
  assert.match(nfl.line, /312 calls/)
  assert.match(nfl.title, /named that pick 31 of 42 times \(74%\)/)
  assert.match(nfl.title, /312 calls/)
  assert.match(nfl.title, /not unique games/)
  assert.match(nfl.title, /not whether it covered/)

  const habit = residualSliceCopy(
    'habit',
    cell({
      key: 'favorite',
      games: 417,
      calls: 417,
      graded: 31,
      correct: 21,
      noCalls: 0,
      accuracy: 21 / 31,
      noCallRate: 0,
    }),
  )
  assert.match(habit.title, /favorite\/dog habit/)
  assert.match(habit.title, /21 of 31 times \(68%\)/)
  assert.match(habit.title, /only that one tendency/)
})
