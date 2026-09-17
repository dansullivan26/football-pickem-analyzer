import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyAgainstThursday,
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
        {
          cbsEventId: 1,
          sport: 'NFL',
          kickoff: thursdayKickoff,
          away: 'DET',
          home: 'BUF',
          homeSpread: -4.5,
          liveHomeSpread: -4.5,
          category: 'neutral',
          recommendedSide: null,
          hook: null,
          cover: null,
          source: null,
          pickedSide: null,
          strength: null,
          score: null,
        },
      ],
    },
  ],
}

test('a Thursday 25/25 is unlikely watching lines', () => {
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

test('a Thursday partial is a maybe-watching building card', () => {
  const summary = summarizePlayerCardTiming(
    'alec',
    history('alec', 10, [change('alec', 0, 10, thursdayDump)]),
    recs,
    null,
    thursdayDump,
  )
  assert.ok(summary)
  assert.equal(summary.read, 'possible')
  assert.equal(summary.thisWeek?.bucket, 'building')
})

test('finishing Saturday after a Thursday look is likely watching', () => {
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
