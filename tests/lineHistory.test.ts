import assert from 'node:assert/strict'
import test from 'node:test'
import {
  lineHistoryByEvent,
  ticksEndingAtLive,
  totalsEndingAtLive,
  updateLineHistory,
} from '../src/lineHistory.ts'
import type { LineHistory, OddsEvent } from '../src/types.ts'

const week = { order: 1, label: 'Week 1' }

function event(
  cbsEventId: number,
  line: number,
  retrievedAt: string,
  extra?: Partial<OddsEvent['lines']['draftkings']> & {
    total?: { line: number; retrievedAt: string; previousLine?: number }
  },
): OddsEvent {
  const { total, ...spread } = extra ?? {}
  return {
    cbsEventId,
    sport: 'NCAAF',
    kickoff: '2026-08-29T12:00:00-04:00',
    awayTeam: 'Away',
    homeTeam: 'Home',
    lines: {
      draftkings: { line, retrievedAt, ...spread },
    },
    ...(total ? { totals: { draftkings: total } } : {}),
  }
}

test('records the opening DraftKings number on first sight', () => {
  const history = updateLineHistory({
    previous: null,
    week,
    events: [event(1, -7.5, '2026-08-27T12:00:00Z')],
    runAt: '2026-08-27T12:00:00Z',
    previousUpdatedAt: null,
  })

  assert.deepEqual(history.games[0]?.ticks, [
    { at: '2026-08-27T12:00:00Z', home: -7.5 },
  ])
})

test('appends only when the home spread actually changes', () => {
  const opening = updateLineHistory({
    previous: null,
    week,
    events: [event(1, -7.5, '2026-08-27T12:00:00Z')],
    runAt: '2026-08-27T12:00:00Z',
    previousUpdatedAt: null,
  })
  const unchanged = updateLineHistory({
    previous: opening,
    week,
    events: [event(1, -7.5, '2026-08-27T13:00:00Z')],
    runAt: '2026-08-27T13:00:00Z',
    previousUpdatedAt: '2026-08-27T12:00:00Z',
  })
  const moved = updateLineHistory({
    previous: unchanged,
    week,
    events: [event(1, -9.5, '2026-08-28T00:00:00Z')],
    runAt: '2026-08-28T00:00:00Z',
    previousUpdatedAt: '2026-08-27T13:00:00Z',
  })

  assert.equal(unchanged.games[0]?.ticks.length, 1)
  assert.deepEqual(
    moved.games[0]?.ticks.map((tick) => tick.home),
    [-7.5, -9.5],
  )
})

test('keeps the whole week path across several moves', () => {
  let history: LineHistory | null = null
  const prices = [-7.5, -8, -8.5, -9.5]
  for (const [index, line] of prices.entries()) {
    const at = `2026-08-2${7 + index}T12:00:00Z`
    history = updateLineHistory({
      previous: history,
      week,
      events: [event(1, line, at)],
      runAt: at,
      previousUpdatedAt: history?.updatedAt ?? null,
    })
  }

  assert.deepEqual(
    history?.games[0]?.ticks.map((tick) => tick.home),
    prices,
  )
})

test('seeds the prior pull when history is empty but previousLine is present', () => {
  const history = updateLineHistory({
    previous: null,
    week,
    events: [
      event(1, -9.5, '2026-08-28T00:00:00Z', { previousLine: -7.5 }),
    ],
    runAt: '2026-08-28T00:00:00Z',
    previousUpdatedAt: '2026-08-27T12:00:00Z',
  })

  assert.deepEqual(history.games[0]?.ticks, [
    { at: '2026-08-27T12:00:00Z', home: -7.5 },
    { at: '2026-08-28T00:00:00Z', home: -9.5 },
  ])
})

test('starts a new file when the slate week changes', () => {
  const week1 = updateLineHistory({
    previous: null,
    week,
    events: [event(1, -7.5, '2026-08-27T12:00:00Z')],
    runAt: '2026-08-27T12:00:00Z',
    previousUpdatedAt: null,
  })
  const week2 = updateLineHistory({
    previous: week1,
    week: { order: 2, label: 'Week 2' },
    events: [event(99, -3.5, '2026-09-03T12:00:00Z')],
    runAt: '2026-09-03T12:00:00Z',
    previousUpdatedAt: week1.updatedAt,
  })

  assert.equal(week2.week, 2)
  assert.equal(week2.games.length, 1)
  assert.equal(week2.games[0]?.cbsEventId, 99)
})

test('starts a new file when the season year changes on the same week number', () => {
  const week1 = updateLineHistory({
    previous: null,
    week: { order: 1, label: 'Week 1', seasonYear: 2026 },
    events: [event(1, -7.5, '2026-08-27T12:00:00Z')],
    runAt: '2026-08-27T12:00:00Z',
    previousUpdatedAt: null,
  })
  const nextYear = updateLineHistory({
    previous: week1,
    week: { order: 1, label: 'Week 1', seasonYear: 2027 },
    events: [event(99, -3.5, '2027-08-26T12:00:00Z')],
    runAt: '2027-08-26T12:00:00Z',
    previousUpdatedAt: week1.updatedAt,
  })

  assert.equal(nextYear.seasonYear, 2027)
  assert.equal(nextYear.games.length, 1)
  assert.equal(nextYear.games[0]?.cbsEventId, 99)
})

test('tracks tiebreaker totals the same way as spreads', () => {
  const opening = updateLineHistory({
    previous: null,
    week,
    events: [
      event(1, -3.5, '2026-08-27T12:00:00Z', {
        total: { line: 52.5, retrievedAt: '2026-08-27T12:00:00Z' },
      }),
    ],
    runAt: '2026-08-27T12:00:00Z',
    previousUpdatedAt: null,
  })
  const moved = updateLineHistory({
    previous: opening,
    week,
    events: [
      event(1, -3.5, '2026-08-27T12:00:00Z', {
        total: { line: 53.5, retrievedAt: '2026-08-28T00:00:00Z' },
      }),
    ],
    runAt: '2026-08-28T00:00:00Z',
    previousUpdatedAt: opening.updatedAt,
  })

  assert.deepEqual(
    moved.games[0]?.totals?.map((tick) => tick.line),
    [52.5, 53.5],
  )
})

test('ignores history from another week in the lookup map', () => {
  const history = updateLineHistory({
    previous: null,
    week,
    events: [event(1, -7.5, '2026-08-27T12:00:00Z')],
    runAt: '2026-08-27T12:00:00Z',
    previousUpdatedAt: null,
  })

  assert.equal(lineHistoryByEvent(history, 1).get(1)?.ticks.length, 1)
  assert.equal(lineHistoryByEvent(history, 2).size, 0)
})

test('drops an implausible jump instead of recording a bad snapshot', () => {
  const opening = updateLineHistory({
    previous: null,
    week,
    events: [event(1, -23.5, '2026-08-27T12:00:00Z')],
    runAt: '2026-08-27T12:00:00Z',
    previousUpdatedAt: null,
  })
  const flipped = updateLineHistory({
    previous: opening,
    week,
    events: [event(1, 23.5, '2026-08-27T13:00:00Z')],
    runAt: '2026-08-27T13:00:00Z',
    previousUpdatedAt: opening.updatedAt,
  })
  const restored = updateLineHistory({
    previous: flipped,
    week,
    events: [event(1, -23.5, '2026-08-27T14:00:00Z')],
    runAt: '2026-08-27T14:00:00Z',
    previousUpdatedAt: flipped.updatedAt,
  })

  assert.deepEqual(
    restored.games[0]?.ticks.map((tick) => tick.home),
    [-23.5],
  )
})

test('displayed path appends the live number when history lags', () => {
  const ticks = [
    { at: '2026-08-26T19:25:54.869Z', home: -8.5 },
    { at: '2026-08-26T23:05:26.891Z', home: -9.5 },
  ]

  assert.deepEqual(
    ticksEndingAtLive(ticks, {
      line: -8.5,
      retrievedAt: '2026-08-28T14:25:50.414Z',
    }).map((tick) => tick.home),
    [-8.5, -9.5, -8.5],
  )
  assert.equal(
    ticksEndingAtLive(ticks, {
      line: -9.5,
      retrievedAt: '2026-08-28T14:25:50.414Z',
    }),
    ticks,
  )
  assert.equal(ticksEndingAtLive(ticks, undefined), ticks)
})

test('displayed totals path appends the live number when history lags', () => {
  const ticks = [
    { at: '2026-08-27T12:00:00Z', line: 52.5 },
    { at: '2026-08-27T18:00:00Z', line: 53.5 },
  ]

  assert.deepEqual(
    totalsEndingAtLive(ticks, {
      line: 54.5,
      retrievedAt: '2026-08-28T14:25:50.414Z',
    }).map((tick) => tick.line),
    [52.5, 53.5, 54.5],
  )
  assert.deepEqual(
    totalsEndingAtLive(undefined, {
      line: 54.5,
      retrievedAt: '2026-08-28T14:25:50.414Z',
    }),
    [{ at: '2026-08-28T14:25:50.414Z', line: 54.5 }],
  )
})
