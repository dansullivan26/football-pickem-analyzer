import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatSpread,
  pickResultLabel,
  pickResultState,
  pickSelectionLabel,
} from '../src/pickLabels.ts'
import type { PlayerPick } from '../src/types.ts'

function pick(overrides: Partial<PlayerPick> = {}): PlayerPick {
  return {
    gameId: 'game-1',
    cbsEventId: 50027398,
    sport: 'NCAAF',
    away: 'UNC',
    home: 'TCU',
    homeSpread: -7.5,
    pickedTeamId: null,
    pickedTeam: null,
    pickedSide: null,
    result: null,
    points: null,
    pickStatus: 'NONE',
    matchStatus: 'unpicked',
    ...overrides,
  }
}

const gradedMiss = pick({
  result: 'loss',
  points: 0,
  matchStatus: 'unpicked',
  pickStatus: 'NONE',
})

test('a graded miss reads as finished, not awaiting results', () => {
  assert.equal(pickResultState(gradedMiss), 'miss')
  assert.equal(pickResultLabel(gradedMiss), 'Missed')
})

test('an ungraded miss on a final game still reads as finished', () => {
  const missing = pick()
  assert.equal(pickResultState(missing, true), 'miss')
  assert.equal(pickResultLabel(missing, true), 'Missed')
})

test('a win or push without a pick is still a miss for the player', () => {
  assert.equal(pickResultState(pick({ result: 'win' })), 'miss')
  assert.equal(pickResultState(pick({ result: 'push' })), 'miss')
})

test('a made pick without a result stays pending', () => {
  const live = pick({
    pickedSide: 'home',
    pickedTeam: 'TCU',
    pickedTeamId: 'tcu',
    matchStatus: 'matched',
  })
  assert.equal(pickResultState(live), 'pending')
  assert.equal(pickResultLabel(live), 'Pending')
  assert.equal(pickResultLabel(live, true), 'Pending')
})

test('an unpicked game that has not kicked off is awaiting results', () => {
  assert.equal(pickResultState(pick()), 'awaiting')
  assert.equal(pickResultLabel(pick()), 'Awaiting results')
})

test('graded picks keep their result label', () => {
  const made = { pickedSide: 'away' as const, pickedTeam: 'UNC', matchStatus: 'matched' as const }
  assert.equal(pickResultLabel(pick({ ...made, result: 'win' })), 'win')
  assert.equal(pickResultLabel(pick({ ...made, result: 'loss' })), 'loss')
  assert.equal(pickResultLabel(pick({ ...made, result: 'push' })), 'push')
})

test('match problems outrank grading state', () => {
  const ambiguous = pick({ matchStatus: 'ambiguous', result: 'loss' })
  const unmatched = pick({ matchStatus: 'unmatched', result: 'loss' })
  assert.equal(pickResultLabel(ambiguous, true), 'Needs review')
  assert.equal(pickResultLabel(unmatched, true), 'Unmatched')
  assert.equal(pickResultState(ambiguous), 'ambiguous')
  assert.equal(pickResultState(unmatched), 'unmatched')
})

test('the selection line reports a missing pick', () => {
  assert.equal(pickSelectionLabel(gradedMiss), 'No pick recorded')
  assert.equal(
    pickSelectionLabel(
      pick({ pickedSide: 'home', pickedTeam: 'TCU', matchStatus: 'matched' }),
    ),
    'TCU -7.5',
  )
  assert.equal(
    pickSelectionLabel(
      pick({ pickedSide: 'away', pickedTeam: 'UNC', matchStatus: 'matched' }),
    ),
    'UNC +7.5',
  )
})

test('formatSpread marks a pick em', () => {
  assert.equal(formatSpread(0), 'PK')
  assert.equal(formatSpread(-3), '-3')
  assert.equal(formatSpread(6.5), '+6.5')
})
