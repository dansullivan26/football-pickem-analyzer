import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EVIDENCE_LABELS,
  EVIDENCE_RULES,
  leanLabel,
} from '../src/playerPrediction.ts'

test('lean labels describe the meter, not the sample', () => {
  assert.equal(leanLabel(71), 'Strong lean')
  assert.equal(leanLabel(59), 'Clear lean')
  assert.equal(leanLabel(17), 'Slight lean')
})

test('lean bands include their lower bound', () => {
  assert.equal(leanLabel(70), 'Strong lean')
  assert.equal(leanLabel(40), 'Clear lean')
  assert.equal(leanLabel(20), 'Mild lean')
  assert.equal(leanLabel(0), 'Slight lean')
})

test('a tall meter on a thin sample and a shorter meter on a deep one read differently', () => {
  // The pairing that looked like a bug: both were labeled "medium confidence"
  // next to meters of 17 and 71.
  assert.equal(
    `${leanLabel(71)} · ${EVIDENCE_LABELS.medium}`,
    'Strong lean · Fair sample',
  )
  assert.equal(
    `${leanLabel(17)} · ${EVIDENCE_LABELS.medium}`,
    'Slight lean · Fair sample',
  )
  assert.equal(
    `${leanLabel(59)} · ${EVIDENCE_LABELS.high}`,
    'Clear lean · Deep sample',
  )
})

test('every evidence tier states the rule behind it', () => {
  for (const tier of ['low', 'medium', 'high'] as const) {
    assert.ok(EVIDENCE_LABELS[tier].length > 0)
    assert.match(EVIDENCE_RULES[tier], /chances/)
  }
})
