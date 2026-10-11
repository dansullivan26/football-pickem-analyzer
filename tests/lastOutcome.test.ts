import assert from 'node:assert/strict'
import test from 'node:test'
import {
  comingOffNotesForGame,
  formatComingOffNote,
  lastGradedAppearance,
  lastOutcomeQuality,
} from '../src/lastOutcome.ts'
import { teamKey, type TeamAppearance } from '../src/teamPerformance.ts'

function appearance(
  overrides: Partial<TeamAppearance> &
    Pick<TeamAppearance, 'cbsEventId' | 'kickoff'>,
): TeamAppearance {
  return {
    week: 5,
    weekLabel: 'Week 5',
    sport: 'NFL',
    opponent: 'Buffalo',
    opponentAbbrev: 'BUF',
    side: 'away',
    venue: 'away',
    market: 'favorite',
    homeSpread: 3.5,
    result: 'loss',
    awayScore: 17,
    homeScore: 24,
    weather: null,
    travel: null,
    rest: null,
    ...overrides,
  }
}

test('ATS cover is a good result and a miss is a bad one', () => {
  const kickoff = '2026-10-04T13:00:00-04:00'
  assert.equal(
    lastOutcomeQuality(appearance({ cbsEventId: 1, kickoff, result: 'win' })),
    'good',
  )
  assert.equal(
    lastOutcomeQuality(appearance({ cbsEventId: 1, kickoff, result: 'loss' })),
    'bad',
  )
  assert.equal(
    lastOutcomeQuality(appearance({ cbsEventId: 1, kickoff, result: 'push' })),
    null,
  )
})

test('last graded appearance is the most recent scored game before kickoff', () => {
  const last = lastGradedAppearance(
    [
      appearance({
        cbsEventId: 1,
        week: 4,
        kickoff: '2026-09-27T13:00:00-04:00',
        opponent: 'Miami',
      }),
      appearance({
        cbsEventId: 2,
        week: 5,
        kickoff: '2026-10-04T13:00:00-04:00',
        opponent: 'Buffalo',
        awayScore: 20,
        homeScore: 17,
        result: 'win',
      }),
      appearance({
        cbsEventId: 3,
        week: 6,
        kickoff: '2026-10-11T13:00:00-04:00',
        awayScore: null,
        homeScore: null,
        result: null,
      }),
    ],
    '2026-10-11T13:00:00-04:00',
  )
  assert.equal(last?.cbsEventId, 2)
  assert.equal(last?.opponent, 'Buffalo')
})

test('coming-off copy names quality, SU result, and the opponent', () => {
  const badLoss = formatComingOffNote(
    'Kansas City',
    appearance({
      cbsEventId: 1,
      kickoff: '2026-10-04T13:00:00-04:00',
    }),
    { nickname: 'Bills', appearances: [] },
  )
  assert.equal(
    badLoss?.line,
    'Kansas City coming off a bad loss against the Bills',
  )
  assert.match(badLoss?.title ?? '', /17–24/)
  assert.match(badLoss?.title ?? '', /did not cover/)
  assert.match(badLoss?.title ?? '', /not in the recommendation/)

  const goodWin = formatComingOffNote(
    'Philadelphia',
    appearance({
      cbsEventId: 2,
      kickoff: '2026-10-04T13:00:00-04:00',
      opponent: 'Denver',
      opponentAbbrev: 'DEN',
      side: 'home',
      market: 'favorite',
      homeSpread: -6.5,
      awayScore: 10,
      homeScore: 21,
      result: 'win',
    }),
  )
  assert.equal(
    goodWin?.line,
    'Philadelphia coming off a good win against Denver',
  )

  const pushWin = formatComingOffNote(
    'Detroit',
    appearance({
      cbsEventId: 3,
      kickoff: '2026-10-04T13:00:00-04:00',
      opponent: 'Cincinnati',
      result: 'push',
      side: 'home',
      homeSpread: -3,
      awayScore: 17,
      homeScore: 20,
    }),
  )
  assert.equal(pushWin?.line, 'Detroit coming off a win against Cincinnati')
})

test('NFL games get notes; college games do not', () => {
  const byKey = new Map([
    [
      teamKey('NFL', 'KC'),
      {
        appearances: [
          appearance({
            cbsEventId: 50,
            kickoff: '2026-10-04T13:00:00-04:00',
          }),
        ],
      },
    ],
    [
      teamKey('NFL', 'BUF'),
      { nickname: 'Bills', appearances: [] },
    ],
  ])
  const nfl = comingOffNotesForGame(
    {
      sport: 'NFL',
      kickoff: '2026-10-11T13:00:00-04:00',
      away: { abbrev: 'KC', name: 'Kansas City' },
      home: { abbrev: 'BUF', name: 'Buffalo' },
    },
    byKey,
    teamKey,
  )
  assert.equal(
    nfl.away?.line,
    'Kansas City coming off a bad loss against the Bills',
  )
  assert.equal(nfl.home, null)

  const college = comingOffNotesForGame(
    {
      sport: 'NCAAF',
      kickoff: '2026-10-11T12:00:00-04:00',
      away: { abbrev: 'KC', name: 'Kansas City' },
      home: { abbrev: 'BUF', name: 'Buffalo' },
    },
    byKey,
    teamKey,
  )
  assert.equal(college.away, null)
  assert.equal(college.home, null)
})
