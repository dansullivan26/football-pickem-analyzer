import assert from 'node:assert/strict'
import test from 'node:test'
import {
  commonOpponentsForAbbrevs,
  commonOpponentsForGame,
  formatCommonOpponentMeeting,
  formatCommonOpponentsHeading,
} from '../src/commonOpponents.ts'
import { teamKey, type TeamAppearance } from '../src/teamPerformance.ts'

function appearance(
  overrides: Partial<TeamAppearance> &
    Pick<TeamAppearance, 'cbsEventId' | 'kickoff' | 'opponentAbbrev'>,
): TeamAppearance {
  return {
    week: 3,
    weekLabel: 'Week 3',
    sport: 'NFL',
    opponent: overrides.opponent ?? overrides.opponentAbbrev,
    side: 'home',
    venue: 'home',
    market: 'favorite',
    homeSpread: -3.5,
    result: 'win',
    awayScore: 17,
    homeScore: 24,
    weather: null,
    travel: null,
    rest: null,
    ...overrides,
  }
}

function team(
  abbrev: string,
  name: string,
  appearances: TeamAppearance[],
) {
  return { abbrev, name, appearances }
}

const kickoff = '2026-10-18T13:00:00-04:00'
const game = {
  sport: 'NFL' as const,
  kickoff,
  cbsEventId: 700,
  away: { abbrev: 'CHI', name: 'Chicago' },
  home: { abbrev: 'ATL', name: 'Atlanta' },
}

test('meeting copy names the team SU result and ATS result', () => {
  assert.equal(
    formatCommonOpponentMeeting({
      teamAbbrev: 'NE',
      teamName: 'New England',
      week: 7,
      weekLabel: 'Week 7',
      kickoff: '2026-10-19T13:00:00-04:00',
      cbsEventId: 1,
      venue: 'home',
      spread: -7.5,
      result: 'loss',
      ours: 26,
      theirs: 19,
    }),
    'New England: W 26–19 (Week 7). ATS -7.5 Loss',
  )
  assert.equal(
    formatCommonOpponentMeeting({
      teamAbbrev: 'CHI',
      teamName: 'Chicago',
      week: 5,
      weekLabel: 'Week 5',
      kickoff: '2026-10-04T13:00:00-04:00',
      cbsEventId: 2,
      venue: 'home',
      spread: -3.5,
      result: 'win',
      ours: 23,
      theirs: 12,
    }),
    'Chicago: W 23–12 (Week 5). ATS -3.5 Win',
  )
  assert.equal(
    formatCommonOpponentMeeting({
      teamAbbrev: 'ATL',
      teamName: 'Atlanta',
      week: 3,
      weekLabel: 'Week 3',
      kickoff: '2026-09-27T13:00:00-04:00',
      cbsEventId: 3,
      venue: 'home',
      spread: -3,
      result: 'push',
      ours: 20,
      theirs: 20,
    }),
    'Atlanta: T 20–20 (Week 3). ATS -3 Push',
  )
  assert.equal(
    formatCommonOpponentMeeting({
      teamAbbrev: 'GB',
      teamName: 'Green Bay',
      week: 8,
      weekLabel: 'Week 8',
      kickoff: '2026-10-25T13:00:00-04:00',
      cbsEventId: 4,
      venue: 'away',
      spread: 3.5,
      result: null,
      ours: null,
      theirs: null,
    }),
    'Green Bay: (Week 8). ATS +3.5 pending',
  )
})

test('returns null when the sides have no shared CBS opponent', () => {
  const teams = new Map([
    [
      teamKey('NFL', 'CHI'),
      team('CHI', 'Chicago', [
        appearance({
          cbsEventId: 1,
          kickoff: '2026-09-13T13:00:00-04:00',
          opponentAbbrev: 'MIN',
          opponent: 'Minnesota',
        }),
      ]),
    ],
    [
      teamKey('NFL', 'ATL'),
      team('ATL', 'Atlanta', [
        appearance({
          cbsEventId: 2,
          kickoff: '2026-09-20T13:00:00-04:00',
          opponentAbbrev: 'NO',
          opponent: 'New Orleans',
        }),
      ]),
    ],
  ])
  assert.equal(commonOpponentsForGame(game, teams), null)
})

test('pairs the latest prior meeting against a shared opponent', () => {
  const teams = new Map([
    [
      teamKey('NFL', 'CHI'),
      team('CHI', 'Chicago', [
        appearance({
          cbsEventId: 10,
          week: 2,
          kickoff: '2026-09-20T13:00:00-04:00',
          opponentAbbrev: 'GB',
          opponent: 'Green Bay',
          side: 'away',
          venue: 'away',
          homeSpread: -3.5,
          result: 'loss',
          awayScore: 17,
          homeScore: 27,
        }),
        appearance({
          cbsEventId: 11,
          week: 4,
          kickoff: '2026-10-04T13:00:00-04:00',
          opponentAbbrev: 'GB',
          opponent: 'Green Bay',
          side: 'home',
          venue: 'home',
          homeSpread: 3,
          result: 'win',
          awayScore: 20,
          homeScore: 24,
        }),
      ]),
    ],
    [
      teamKey('NFL', 'ATL'),
      team('ATL', 'Atlanta', [
        appearance({
          cbsEventId: 12,
          week: 3,
          kickoff: '2026-09-27T13:00:00-04:00',
          opponentAbbrev: 'GB',
          opponent: 'Green Bay',
          side: 'home',
          venue: 'home',
          homeSpread: -6.5,
          result: 'loss',
          awayScore: 30,
          homeScore: 16,
        }),
      ]),
    ],
  ])

  const breakdown = commonOpponentsForGame(game, teams)
  assert.equal(breakdown?.heading, '1 shared CBS opponent')
  assert.equal(breakdown?.groups.length, 1)
  const group = breakdown?.groups[0]
  assert.equal(group?.kind, 'shared')
  assert.equal(group?.opponentAbbrev, 'GB')
  assert.equal(group?.opponentName, 'Green Bay')
  assert.equal(group?.away.cbsEventId, 11)
  assert.equal(
    formatCommonOpponentMeeting(group!.away),
    'Chicago: W 24–20 (Week 4). ATS +3 Win',
  )
  assert.equal(
    formatCommonOpponentMeeting(group!.home),
    'Atlanta: L 16–30 (Week 3). ATS -6.5 Loss',
  )
})

test('ignores the current game and later kickoffs', () => {
  const teams = new Map([
    [
      teamKey('NFL', 'CHI'),
      team('CHI', 'Chicago', [
        appearance({
          cbsEventId: 700,
          kickoff,
          opponentAbbrev: 'ATL',
          opponent: 'Atlanta',
        }),
        appearance({
          cbsEventId: 800,
          week: 8,
          kickoff: '2026-10-25T13:00:00-04:00',
          opponentAbbrev: 'GB',
          opponent: 'Green Bay',
        }),
      ]),
    ],
    [
      teamKey('NFL', 'ATL'),
      team('ATL', 'Atlanta', [
        appearance({
          cbsEventId: 700,
          kickoff,
          opponentAbbrev: 'CHI',
          opponent: 'Chicago',
          side: 'home',
        }),
        appearance({
          cbsEventId: 801,
          week: 8,
          kickoff: '2026-10-25T16:25:00-04:00',
          opponentAbbrev: 'GB',
          opponent: 'Green Bay',
        }),
      ]),
    ],
  ])
  assert.equal(commonOpponentsForGame(game, teams), null)
})

test('lists a prior head-to-head ahead of shared opponents', () => {
  const teams = new Map([
    [
      teamKey('NFL', 'CHI'),
      team('CHI', 'Chicago', [
        appearance({
          cbsEventId: 50,
          week: 2,
          kickoff: '2026-09-20T13:00:00-04:00',
          opponentAbbrev: 'ATL',
          opponent: 'Atlanta',
          side: 'away',
          venue: 'away',
          homeSpread: -3,
          result: 'win',
          awayScore: 21,
          homeScore: 17,
        }),
        appearance({
          cbsEventId: 60,
          week: 4,
          kickoff: '2026-10-04T13:00:00-04:00',
          opponentAbbrev: 'CAR',
          opponent: 'Carolina',
          side: 'home',
          venue: 'home',
          homeSpread: -7,
          result: 'win',
          awayScore: 10,
          homeScore: 31,
        }),
      ]),
    ],
    [
      teamKey('NFL', 'ATL'),
      team('ATL', 'Atlanta', [
        appearance({
          cbsEventId: 50,
          week: 2,
          kickoff: '2026-09-20T13:00:00-04:00',
          opponentAbbrev: 'CHI',
          opponent: 'Chicago',
          side: 'home',
          venue: 'home',
          homeSpread: -3,
          result: 'loss',
          awayScore: 21,
          homeScore: 17,
        }),
        appearance({
          cbsEventId: 61,
          week: 3,
          kickoff: '2026-09-27T13:00:00-04:00',
          opponentAbbrev: 'CAR',
          opponent: 'Carolina',
          side: 'away',
          venue: 'away',
          homeSpread: 3.5,
          result: 'loss',
          awayScore: 20,
          homeScore: 27,
        }),
      ]),
    ],
  ])

  const breakdown = commonOpponentsForGame(game, teams)
  assert.deepEqual(
    breakdown?.groups.map((group) => group.kind),
    ['head-to-head', 'shared'],
  )
  assert.equal(
    formatCommonOpponentsHeading(breakdown!.groups),
    'They already met · 1 shared CBS opponent',
  )
  assert.equal(breakdown?.groups[0]?.opponentAbbrev, 'ATL')
  assert.equal(
    formatCommonOpponentMeeting(breakdown!.groups[0]!.away),
    'Chicago: W 21–17 (Week 2). ATS +3 Win',
  )
})

test('matches shared opponents by abbrev, not display name', () => {
  const teams = new Map([
    [
      teamKey('NCAAF', 'UNC'),
      team('UNC', 'North Carolina', [
        appearance({
          sport: 'NCAAF',
          cbsEventId: 1,
          kickoff: '2026-09-12T12:00:00-04:00',
          opponentAbbrev: 'MIAMI',
          opponent: 'Miami',
        }),
      ]),
    ],
    [
      teamKey('NCAAF', 'FSU'),
      team('FSU', 'Florida State', [
        appearance({
          sport: 'NCAAF',
          cbsEventId: 2,
          kickoff: '2026-09-19T12:00:00-04:00',
          opponentAbbrev: 'MIAOH',
          opponent: 'Miami',
        }),
      ]),
    ],
  ])
  assert.equal(
    commonOpponentsForGame(
      {
        sport: 'NCAAF',
        kickoff: '2026-10-17T12:00:00-04:00',
        cbsEventId: 9,
        away: { abbrev: 'UNC', name: 'North Carolina' },
        home: { abbrev: 'FSU', name: 'Florida State' },
      },
      teams,
    ),
    null,
  )
})

test('abbrev lookup infers the sport when both sides live in one league', () => {
  const teams = new Map([
    [
      teamKey('NFL', 'ARI'),
      team('ARI', 'Arizona', [
        appearance({
          cbsEventId: 1,
          kickoff: '2026-09-13T16:25:00-04:00',
          opponentAbbrev: 'SF',
          opponent: 'San Francisco',
          side: 'away',
          venue: 'away',
          homeSpread: -7,
          result: 'loss',
          awayScore: 13,
          homeScore: 20,
        }),
      ]),
    ],
    [
      teamKey('NFL', 'LAR'),
      team('LAR', 'L.A. Rams', [
        appearance({
          cbsEventId: 2,
          kickoff: '2026-09-20T16:25:00-04:00',
          opponentAbbrev: 'SF',
          opponent: 'San Francisco',
          side: 'home',
          venue: 'home',
          homeSpread: -3.5,
          result: 'win',
          awayScore: 17,
          homeScore: 27,
        }),
      ]),
    ],
  ])
  const breakdown = commonOpponentsForAbbrevs(
    { abbrev: 'ARI', name: 'Arizona' },
    { abbrev: 'LAR', name: 'L.A. Rams' },
    '2026-10-18T16:25:00-04:00',
    90,
    teams,
  )
  assert.equal(breakdown?.heading, '1 shared CBS opponent')
  assert.equal(breakdown?.groups[0]?.opponentAbbrev, 'SF')
})
