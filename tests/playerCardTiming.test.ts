import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyAgainstThursday,
  slateProgressByDate,
  summarizePlayerCardTiming,
  weekThursdayDate,
} from '../src/playerCardTiming.ts'
import type {
  PlayerHistory,
  PlayerWeek,
  PicksCountChange,
  RecommendationHistory,
} from '../src/types.ts'

const timeZone = 'America/Indianapolis'
const thursdayDump = '2026-09-17T10:59:50-04:00'
const fridayDump = '2026-09-18T10:00:00-04:00'
const saturdayDump = '2026-09-19T10:00:00-04:00'
const thursdayKickoff = '2026-09-17T20:15:00-04:00'

test('weekThursdayDate is the Thursday of the slate week', () => {
  assert.equal(weekThursdayDate(thursdayKickoff, timeZone), '2026-09-17')
  assert.equal(
    weekThursdayDate('2026-09-19T12:00:00-04:00', timeZone),
    '2026-09-17',
  )
})

test('slateProgressByDate counts today vs leftover kickoffs', () => {
  const progress = slateProgressByDate(
    [
      thursdayKickoff,
      '2026-09-19T12:00:00-04:00',
      '2026-09-19T19:30:00-04:00',
      '2026-09-20T13:00:00-04:00',
    ],
    '2026-09-17',
    timeZone,
  )
  assert.deepEqual(progress, {
    today: 1,
    through: 1,
    remaining: 3,
    total: 4,
  })
})

test('classifyAgainstThursday splits Thu / Fri / weekend', () => {
  assert.equal(
    classifyAgainstThursday(thursdayDump, '2026-09-17', timeZone),
    'early-full',
  )
  assert.equal(
    classifyAgainstThursday(fridayDump, '2026-09-17', timeZone),
    'friday-full',
  )
  assert.equal(
    classifyAgainstThursday(saturdayDump, '2026-09-17', timeZone),
    'late-full',
  )
})

function change(
  entryId: string,
  from: number,
  to: number,
  atOrBefore: string,
  after = '2026-09-17T06:44:53-04:00',
): PicksCountChange {
  return {
    week: 3,
    periodId: 'w3',
    entryId,
    name: entryId,
    changeType: 'picksCount',
    from,
    to,
    picksCountFirstSeenAt: atOrBefore,
    previousFetchedAt: after,
    fetchedAt: atOrBefore,
    window: { after, atOrBefore },
  }
}

function week(entryId: string, picksCount: number): PlayerWeek {
  return {
    week: 3,
    seasonYear: 2026,
    periodId: 'w3',
    label: 'Week 3',
    status: 'in_progress',
    scored: false,
    slateFile: 'w3.json',
    entries: [
      {
        entryId,
        name: entryId,
        weekScore: 0,
        weekRank: null,
        correctPicks: 0,
        picksCount,
        maxPicksCount: 25,
        picksCountFirstSeenAt: picksCount > 0 ? thursdayDump : null,
        tiebreaker: { question: null, answer: null },
        picks: [],
      },
    ],
  }
}

function history(
  entryId: string,
  picksCount: number,
  changes: PicksCountChange[],
): PlayerHistory {
  return {
    source: { fetchedAt: thursdayDump, timezone: timeZone },
    pool: { name: 'Test', seasonYear: 2026 },
    entries: [],
    weeks: [week(entryId, picksCount)],
    picksCountChanges: changes,
  }
}

function recGame(
  cbsEventId: number,
  kickoff: string,
): RecommendationHistory['weeks'][number]['games'][number] {
  return {
    cbsEventId,
    sport: 'NFL',
    kickoff,
    away: 'AWAY',
    home: 'HOME',
    homeSpread: -3,
    liveHomeSpread: -3,
    category: 'neutral',
    recommendedSide: null,
    hook: null,
    cover: null,
    source: null,
    pickedSide: null,
    strength: null,
    score: null,
  }
}

const recs: RecommendationHistory = {
  updatedAt: thursdayDump,
  weeks: [
    {
      week: 3,
      seasonYear: 2026,
      label: 'Week 3',
      capturedAt: thursdayDump,
      scored: false,
      games: [
        recGame(1, thursdayKickoff),
        ...Array.from({ length: 9 }, (_, index) =>
          recGame(10 + index, '2026-09-19T12:00:00-04:00'),
        ),
        ...Array.from({ length: 15 }, (_, index) =>
          recGame(20 + index, '2026-09-20T13:00:00-04:00'),
        ),
      ],
    },
  ],
}

test('a Thursday 25/25 is an early lock of leftover games', () => {
  const summary = summarizePlayerCardTiming(
    'bill',
    history('bill', 25, [change('bill', 0, 25, thursdayDump)]),
    recs,
    null,
    thursdayDump,
  )
  assert.ok(summary)
  assert.equal(summary.read, 'unlikely')
  assert.equal(summary.thisWeek?.bucket, 'early-full')
  assert.match(summary.sentence, /full card in by Thursday/)
})

test('a Thursday 1/25 on a 1-game Thursday is day-of picking', () => {
  const summary = summarizePlayerCardTiming(
    'one',
    history('one', 1, [change('one', 0, 1, thursdayDump)]),
    recs,
    null,
    thursdayDump,
  )
  assert.ok(summary)
  assert.equal(summary.thisWeek?.bucket, 'day-of')
  assert.equal(summary.read, 'likely')
  assert.match(summary.sentence, /that day had games/)
})

test('a Thursday 10/25 with one Thursday game is a partial early lock', () => {
  const summary = summarizePlayerCardTiming(
    'alec',
    history('alec', 10, [change('alec', 0, 10, thursdayDump)]),
    recs,
    null,
    thursdayDump,
  )
  assert.ok(summary)
  assert.equal(summary.read, 'possible')
  assert.equal(summary.thisWeek?.bucket, 'ahead')
})

test('Saturday count matching Thursday plus Saturday games is day-of', () => {
  const summary = summarizePlayerCardTiming(
    'sat',
    {
      ...history('sat', 10, [
        change('sat', 0, 1, thursdayDump),
        change('sat', 1, 10, saturdayDump, thursdayDump),
      ]),
      source: { fetchedAt: saturdayDump, timezone: timeZone },
    },
    recs,
    null,
    saturdayDump,
  )
  assert.ok(summary)
  assert.equal(summary.thisWeek?.bucket, 'day-of')
  assert.equal(summary.read, 'likely')
})

test('finishing Saturday after a Thursday look is later pick timing', () => {
  const summary = summarizePlayerCardTiming(
    'late',
    {
      ...history('late', 25, [
        change('late', 0, 10, thursdayDump),
        change(
          'late',
          10,
          25,
          saturdayDump,
          thursdayDump,
        ),
      ]),
      source: { fetchedAt: saturdayDump, timezone: timeZone },
    },
    recs,
    null,
    saturdayDump,
  )
  assert.ok(summary)
  assert.equal(summary.thisWeek?.bucket, 'late-full')
  assert.equal(summary.read, 'likely')
})

test('skips weeks from before submitted-count tracking', () => {
  const summary = summarizePlayerCardTiming(
    'old',
    {
      source: { fetchedAt: thursdayDump, timezone: timeZone },
      pool: { name: 'Test', seasonYear: 2026 },
      entries: [],
      weeks: [
        {
          week: 2,
          seasonYear: 2026,
          periodId: 'w2',
          label: 'Week 2',
          status: 'scored',
          scored: true,
          slateFile: 'w2.json',
          entries: [
            {
              entryId: 'old',
              name: 'old',
              weekScore: 20,
              weekRank: 1,
              correctPicks: 20,
              picksCount: 25,
              tiebreaker: { question: null, answer: null },
              picks: [],
            },
          ],
        },
      ],
    },
    recs,
  )
  assert.equal(summary, null)
})
