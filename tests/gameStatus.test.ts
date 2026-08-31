import assert from 'node:assert/strict'
import test from 'node:test'
import {
  etDayKey,
  formatEtDayLabel,
  formatGameScore,
  formatWinningScore,
  gameIsCompleted,
  gameIsFinal,
  gameIsOnEtDay,
  gameIsUpcoming,
  mergeEventScores,
  slateKickoffDays,
} from '../src/gameStatus.ts'

const now = Date.parse('2026-08-30T16:00:00-04:00')

test('gameIsUpcoming is true only before kickoff', () => {
  assert.equal(
    gameIsUpcoming({ kickoff: '2026-08-30T19:00:00-04:00' }, now),
    true,
  )
  assert.equal(
    gameIsUpcoming({ kickoff: '2026-08-29T12:00:00-04:00' }, now),
    false,
  )
})

test('gameIsFinal uses status or a known score', () => {
  assert.equal(gameIsFinal({ status: 'SCHEDULED' }), false)
  assert.equal(gameIsFinal({ status: 'FINAL' }), true)
  assert.equal(gameIsFinal({ status: 'final_ot' }), true)
  assert.equal(
    gameIsFinal({ status: 'SCHEDULED', awayScore: 21, homeScore: 17 }),
    true,
  )
})

test('gameIsCompleted includes kicked-off games and finals', () => {
  assert.equal(
    gameIsCompleted({ status: 'SCHEDULED', kickoff: '2026-08-29T12:00:00-04:00' }, now),
    true,
  )
  assert.equal(
    gameIsCompleted({ status: 'SCHEDULED', kickoff: '2026-08-30T19:00:00-04:00' }, now),
    false,
  )
  assert.equal(
    gameIsCompleted(
      {
        status: 'FINAL',
        kickoff: '2026-08-30T19:00:00-04:00',
        awayScore: 10,
        homeScore: 7,
      },
      now,
    ),
    true,
  )
})

test('formatGameScore needs both sides', () => {
  assert.equal(formatGameScore({}), null)
  assert.equal(formatGameScore({ awayScore: 21 }), null)
  assert.equal(formatGameScore({ awayScore: 21, homeScore: 17 }), '21–17')
})

test('formatWinningScore puts the larger score first', () => {
  assert.equal(formatWinningScore({ awayScore: 27, homeScore: 37 }), '37–27')
  assert.equal(formatWinningScore({ awayScore: 37, homeScore: 27 }), '37–27')
  assert.equal(formatWinningScore({ awayScore: 21, homeScore: 21 }), '21–21')
  assert.equal(formatWinningScore({ awayScore: 15 }), null)
})

test('etDayKey and gameIsOnEtDay use the America/New_York calendar day', () => {
  assert.equal(etDayKey('2026-09-05T22:30:00-04:00'), '2026-09-05')
  assert.equal(etDayKey('2026-09-06T00:30:00-04:00'), '2026-09-06')
  assert.equal(formatEtDayLabel('2026-09-05T19:30:00-04:00'), 'Sat Sep 5')
  assert.equal(
    gameIsOnEtDay({ kickoff: '2026-09-06T19:30:00-04:00' }, '2026-09-06'),
    true,
  )
  assert.equal(
    gameIsOnEtDay({ kickoff: '2026-09-06T19:30:00-04:00' }, '2026-09-05'),
    false,
  )
})

test('slateKickoffDays lists unique ET days and marks today', () => {
  const days = slateKickoffDays(
    [
      { kickoff: '2026-09-05T12:00:00-04:00' },
      { kickoff: '2026-09-05T19:30:00-04:00' },
      { kickoff: '2026-09-06T19:30:00-04:00' },
    ],
    Date.parse('2026-09-05T16:00:00-04:00'),
  )
  assert.deepEqual(
    days.map((day) => ({
      key: day.key,
      isToday: day.isToday,
      label: day.label,
    })),
    [
      { key: '2026-09-05', isToday: true, label: 'Sat Sep 5' },
      { key: '2026-09-06', isToday: false, label: 'Sun Sep 6' },
    ],
  )
})

test('mergeEventScores lets the live slate overwrite a frozen score', () => {
  const merged = mergeEventScores([
    [
      { cbsEventId: 1, awayScore: 14, homeScore: 10 },
      { cbsEventId: 2, awayScore: 27, homeScore: 37 },
    ],
    [{ cbsEventId: 1, awayScore: 15, homeScore: 10 }],
  ])
  assert.deepEqual(merged.get(1), { awayScore: 15, homeScore: 10 })
  assert.deepEqual(merged.get(2), { awayScore: 27, homeScore: 37 })
  assert.equal(merged.get(3), undefined)
})
