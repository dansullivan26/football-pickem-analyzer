import assert from 'node:assert/strict'
import test from 'node:test'
import {
  lastKickoffsFromCfbdGames,
  lastKickoffsFromNflverseCsv,
  matchCfbdSchool,
  matchNflverseAbbrev,
  mergePreviousKickoff,
  nflverseKickoff,
  normalizeScheduleName,
  scheduleKickoffBefore,
} from '../src/lastKickoff.ts'

test('normalizeScheduleName treats Hawaiʻi and Hawaii as the same school', () => {
  assert.equal(normalizeScheduleName("Hawai'i"), 'hawaii')
  assert.equal(normalizeScheduleName('Hawaii'), 'hawaii')
  assert.equal(normalizeScheduleName('The Citadel'), 'citadel')
})

test('matchCfbdSchool uses the CBS abbrev alias before a fuzzy name', () => {
  assert.equal(
    matchCfbdSchool(
      { sport: 'NCAAF', abbrev: 'MISS', location: 'Ole Miss', name: 'Ole Miss' },
      ['Mississippi State', 'Ole Miss'],
    ),
    'Ole Miss',
  )
  assert.equal(
    matchCfbdSchool(
      { sport: 'NCAAF', abbrev: 'HAWAII', location: 'Hawaii', name: 'Hawaii' },
      ["Hawai'i", 'Stanford'],
    ),
    "Hawai'i",
  )
  assert.equal(
    matchCfbdSchool(
      { sport: 'NCAAF', abbrev: 'UNK', location: 'Mystery', name: 'Mystery' },
      ['Alabama'],
    ),
    null,
  )
})

test('matchNflverseAbbrev maps CBS leftovers onto Lee Sharpe codes', () => {
  assert.equal(
    matchNflverseAbbrev(
      { sport: 'NFL', abbrev: 'WSH', location: 'Washington', name: 'Washington' },
      ['WAS', 'PHI'],
    ),
    'WAS',
  )
  assert.equal(
    matchNflverseAbbrev(
      { sport: 'NFL', abbrev: 'KC', location: 'Kansas City', name: 'Kansas City' },
      ['KC', 'PHI'],
    ),
    'KC',
  )
})

test('scheduleKickoffBefore ignores the same card game and keeps an earlier one', () => {
  assert.equal(
    scheduleKickoffBefore(
      '2026-09-05T23:00:00-04:00',
      '2026-09-05T23:00:00-04:00',
    ),
    null,
  )
  assert.equal(
    scheduleKickoffBefore(
      '2026-08-29T19:00:00-04:00',
      '2026-09-05T23:00:00-04:00',
    ),
    '2026-08-29T19:00:00-04:00',
  )
  assert.equal(
    mergePreviousKickoff(
      '2026-08-30T12:00:00-04:00',
      '2026-08-29T19:00:00-04:00',
    ),
    '2026-08-30T12:00:00-04:00',
  )
})

test('lastKickoffsFromCfbdGames keeps the latest past kickoff per CBS team', () => {
  const rows = lastKickoffsFromCfbdGames(
    [
      {
        startDate: '2026-08-24T16:00:00.000Z',
        homeTeam: "Hawai'i",
        awayTeam: 'Stanford',
      },
      {
        start_date: '2026-08-30T16:00:00.000Z',
        home_team: "Hawai'i",
        away_team: 'UNLV',
      },
      {
        startDate: '2026-09-12T16:00:00.000Z',
        homeTeam: "Hawai'i",
        awayTeam: 'Fresno State',
      },
    ],
    [
      { sport: 'NCAAF', abbrev: 'HAWAII', location: 'Hawaii', name: 'Hawaii' },
      { sport: 'NFL', abbrev: 'KC', location: 'Kansas City', name: 'Kansas City' },
    ],
    Date.parse('2026-09-03T12:00:00.000Z'),
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.key, 'NCAAF:HAWAII')
  assert.equal(rows[0]?.lastKickoff, '2026-08-30T16:00:00.000Z')
  assert.equal(rows[0]?.source, 'cfbd')
})

test('lastKickoffsFromNflverseCsv skips preseason and future regular-season games', () => {
  const csv = [
    'season,game_type,gameday,gametime,away_team,home_team',
    '2026,PRE,2026-08-16,13:00,PHI,KC',
    '2026,REG,2026-09-06,20:20,PHI,KC',
    '2026,REG,2026-09-13,13:00,KC,PHI',
    '2025,REG,2025-09-07,13:00,PHI,KC',
  ].join('\n')
  const rows = lastKickoffsFromNflverseCsv(
    csv,
    2026,
    [{ sport: 'NFL', abbrev: 'KC', location: 'Kansas City', name: 'Kansas City' }],
    Date.parse('2026-09-07T12:00:00.000Z'),
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.key, 'NFL:KC')
  assert.equal(rows[0]?.lastKickoff, nflverseKickoff('2026-09-06', '20:20'))
  assert.equal(rows[0]?.source, 'nflverse')
})
