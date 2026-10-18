import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatOffSlateHeading,
  formatOffSlateMeeting,
  ncaafScheduleFromCfbdGames,
  offSlateCommonOpponents,
  type NcaafScheduleFile,
} from '../src/ncaafSchedule.ts'
import type { CommonOpponentsBreakdown } from '../src/commonOpponents.ts'

const now = Date.parse('2026-10-18T16:00:00.000Z')

function schedule(games: NcaafScheduleFile['games']): NcaafScheduleFile {
  return { updatedAt: '2026-10-18T00:00:00.000Z', seasonYear: 2026, games }
}

test('ncaafScheduleFromCfbdGames keeps completed past games with scores', () => {
  const rows = ncaafScheduleFromCfbdGames(
    [
      {
        id: 1,
        startDate: '2026-09-13T16:00:00.000Z',
        homeTeam: 'Georgia',
        awayTeam: 'Auburn',
        homePoints: 31,
        awayPoints: 17,
        completed: true,
        neutralSite: false,
      },
      {
        id: 2,
        start_date: '2026-10-25T16:00:00.000Z',
        home_team: 'Georgia',
        away_team: 'Florida',
        home_points: 0,
        away_points: 0,
        completed: false,
      },
      {
        id: 3,
        startDate: '2026-09-06T16:00:00.000Z',
        homeTeam: 'Alabama',
        awayTeam: 'Auburn',
        completed: true,
      },
    ],
    now,
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, '1')
  assert.equal(rows[0]?.homeScore, 31)
  assert.equal(rows[0]?.away, 'Auburn')
})

test('off-slate commons are SU and skip a CBS-card opponent', () => {
  const file = schedule([
    {
      id: 'uga-aub',
      kickoff: '2026-09-13T12:00:00-04:00',
      home: 'Georgia',
      away: 'Auburn',
      homeScore: 31,
      awayScore: 17,
      neutralSite: false,
    },
    {
      id: 'bama-aub',
      kickoff: '2026-09-27T15:30:00-04:00',
      home: 'Auburn',
      away: 'Alabama',
      homeScore: 21,
      awayScore: 24,
      neutralSite: false,
    },
    {
      id: 'uga-uk',
      kickoff: '2026-10-04T12:00:00-04:00',
      home: 'Georgia',
      away: 'Kentucky',
      homeScore: 35,
      awayScore: 14,
      neutralSite: false,
    },
    {
      id: 'bama-uk',
      kickoff: '2026-10-11T19:30:00-04:00',
      home: 'Alabama',
      away: 'Kentucky',
      homeScore: 28,
      awayScore: 17,
      neutralSite: false,
    },
  ])
  const cbs: CommonOpponentsBreakdown = {
    heading: '1 shared CBS opponent',
    groups: [
      {
        kind: 'shared',
        opponentAbbrev: 'UK',
        opponentName: 'Kentucky',
        away: {
          teamAbbrev: 'UGA',
          teamName: 'Georgia',
          week: 6,
          weekLabel: 'Week 6',
          kickoff: '2026-10-04T12:00:00-04:00',
          cbsEventId: 1,
          venue: 'home',
          spread: -24,
          result: 'win',
          ours: 35,
          theirs: 14,
        },
        home: {
          teamAbbrev: 'BAMA',
          teamName: 'Alabama',
          week: 7,
          weekLabel: 'Week 7',
          kickoff: '2026-10-11T19:30:00-04:00',
          cbsEventId: 2,
          venue: 'home',
          spread: -14,
          result: 'win',
          ours: 28,
          theirs: 17,
        },
      },
    ],
  }
  const breakdown = offSlateCommonOpponents(
    {
      sport: 'NCAAF',
      kickoff: '2026-10-18T15:30:00-04:00',
      away: { abbrev: 'UGA', name: 'Georgia', location: 'Georgia' },
      home: { abbrev: 'BAMA', name: 'Alabama', location: 'Alabama' },
    },
    file,
    cbs,
  )
  assert.equal(breakdown?.heading, '1 shared opponent off the CBS card')
  assert.equal(breakdown?.groups.length, 1)
  assert.equal(breakdown?.groups[0]?.opponentName, 'Auburn')
  assert.equal(
    formatOffSlateMeeting(breakdown!.groups[0]!.away),
    'Georgia Sep 13 vs win 31–17',
  )
  assert.equal(
    formatOffSlateMeeting(breakdown!.groups[0]!.home),
    'Alabama Sep 27 at win 24–21',
  )
})

test('off-slate head-to-head is labeled separately from CBS', () => {
  const file = schedule([
    {
      id: 'h2h',
      kickoff: '2026-09-20T15:30:00-04:00',
      home: 'Ole Miss',
      away: 'Mississippi State',
      homeScore: 45,
      awayScore: 20,
      neutralSite: false,
    },
  ])
  const breakdown = offSlateCommonOpponents(
    {
      sport: 'NCAAF',
      kickoff: '2026-10-18T19:00:00-04:00',
      away: { abbrev: 'MISSST', name: 'Miss. State', location: 'Mississippi State' },
      home: { abbrev: 'MISS', name: 'Ole Miss', location: 'Ole Miss' },
    },
    file,
  )
  assert.equal(breakdown?.heading, 'They already met off the CBS card')
  assert.equal(breakdown?.groups[0]?.kind, 'head-to-head')
  assert.equal(
    formatOffSlateMeeting(breakdown!.groups[0]!.away),
    'Miss. State Sep 20 at loss 20–45',
  )
})

test('NFL games and empty schedules stay hidden', () => {
  assert.equal(
    offSlateCommonOpponents(
      {
        sport: 'NFL',
        kickoff: '2026-10-18T13:00:00-04:00',
        away: { abbrev: 'CHI', name: 'Chicago' },
        home: { abbrev: 'ATL', name: 'Atlanta' },
      },
      schedule([]),
    ),
    null,
  )
  assert.equal(
    formatOffSlateHeading([]),
    '',
  )
})
