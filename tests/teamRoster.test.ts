import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMPTY_TEAM_ROSTER,
  mergeTeamRoster,
  teamRosterIndex,
  teamsFromSlate,
} from '../src/teamRoster.ts'
import type { Slate, Team } from '../src/types.ts'

function team(overrides: Partial<Team> & { abbrev: string }): Team {
  return {
    id: `id-${overrides.abbrev}`,
    name: overrides.abbrev,
    nickname: '',
    location: '',
    conference: '',
    record: '',
    rank: null,
    pickemPctStraightUp: 0,
    pickemPctAgainstSpread: 0,
    ...overrides,
  }
}

function slate(
  games: Array<{ sport: 'NFL' | 'NCAAF'; away: Team; home: Team }>,
): Slate {
  return {
    source: { fetchedAt: '2026-09-09T12:00:00Z', timezone: 'America/New_York' },
    pool: { name: 'Pool', seasonYear: 2026, entriesCount: 26 },
    week: {
      label: 'Week 2',
      order: 2,
      gamesOnSlate: games.length,
      ncaafGames: games.filter((game) => game.sport === 'NCAAF').length,
      nflGames: games.filter((game) => game.sport === 'NFL').length,
    },
    games: games.map((game, index) => ({
      id: `game-${index}`,
      cbsEventId: index + 1,
      sport: game.sport,
      week: 2,
      status: 'scheduled',
      kickoff: '2026-09-12T23:00:00Z',
      kickoffLabel: 'Sat 7:00 PM ET',
      tv: null,
      away: game.away,
      home: game.home,
      homeSpread: -3,
      line: 'HOME -3',
    })),
  }
}

test('teamsFromSlate keeps the CBS identity for both sides', () => {
  const teams = teamsFromSlate(
    slate([
      {
        sport: 'NCAAF',
        away: team({
          abbrev: 'ARKST',
          name: 'Arkansas St.',
          location: 'Arkansas State',
          nickname: 'Red Wolves',
          conference: 'BELT',
        }),
        home: team({ abbrev: 'MEMP', name: 'Memphis', conference: 'AAC' }),
      },
    ]),
  )

  assert.deepEqual(teams[0], {
    sport: 'NCAAF',
    abbrev: 'ARKST',
    name: 'Arkansas St.',
    location: 'Arkansas State',
    nickname: 'Red Wolves',
    conference: 'BELT',
    teamId: 'id-ARKST',
  })
  assert.equal(teams[1]?.abbrev, 'MEMP')
  assert.equal(teams[1]?.location, null)
})

test('mergeTeamRoster keeps last week teams when a new slate drops them', () => {
  const weekOne = mergeTeamRoster(
    EMPTY_TEAM_ROSTER,
    teamsFromSlate(
      slate([
        {
          sport: 'NCAAF',
          away: team({ abbrev: 'BC', name: 'Boston College', conference: 'ACC' }),
          home: team({ abbrev: 'CINCY', name: 'Cincinnati', conference: 'BIG12' }),
        },
      ]),
    ),
    '2026-09-02T12:00:00Z',
  )
  const weekTwo = mergeTeamRoster(
    weekOne,
    teamsFromSlate(
      slate([
        {
          sport: 'NFL',
          away: team({ abbrev: 'KC', name: 'Kansas City', conference: 'AFC West' }),
          home: team({ abbrev: 'BUF', name: 'Buffalo', conference: 'AFC East' }),
        },
      ]),
    ),
    '2026-09-09T12:00:00Z',
  )

  const index = teamRosterIndex(weekTwo)
  assert.equal(index.get('NCAAF:BC')?.name, 'Boston College')
  assert.equal(index.get('NCAAF:BC')?.conference, 'ACC')
  assert.equal(index.get('NFL:KC')?.name, 'Kansas City')
  assert.equal(weekTwo.updatedAt, '2026-09-09T12:00:00Z')
  assert.deepEqual(
    weekTwo.teams.map((row) => `${row.sport}:${row.abbrev}`),
    ['NCAAF:BC', 'NCAAF:CINCY', 'NFL:BUF', 'NFL:KC'],
  )
})

test('a later slate can correct a name but never blanks a known field', () => {
  const first = mergeTeamRoster(
    EMPTY_TEAM_ROSTER,
    teamsFromSlate(
      slate([
        {
          sport: 'NCAAF',
          away: team({
            abbrev: 'MIAMI',
            name: 'Miami (Fla.)',
            location: 'Miami',
            nickname: 'Hurricanes',
            conference: 'ACC',
          }),
          home: team({ abbrev: 'STNFRD', name: 'Stanford' }),
        },
      ]),
    ),
  )
  const second = mergeTeamRoster(
    first,
    teamsFromSlate(
      slate([
        {
          sport: 'NCAAF',
          away: team({ abbrev: 'MIAMI', name: 'Miami' }),
          home: team({ abbrev: 'STNFRD', name: 'Stanford' }),
        },
      ]),
    ),
  )

  const miami = teamRosterIndex(second).get('NCAAF:MIAMI')
  assert.equal(miami?.name, 'Miami')
  assert.equal(miami?.nickname, 'Hurricanes')
  assert.equal(miami?.conference, 'ACC')
})
