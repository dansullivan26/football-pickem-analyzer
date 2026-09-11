import assert from 'node:assert/strict'
import test from 'node:test'
import { residualLabel } from '../src/playerPrediction.ts'

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
