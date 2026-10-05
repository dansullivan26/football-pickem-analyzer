import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCfbdBowlNames,
  bowlGamesFromBookRows,
  homeSpreadFromRow,
  isBowlWindowKickoff,
  mergeBowlOdds,
  usableBowlSpread,
} from '../src/bowlOdds.ts'
import {
  attachRosterToBowlGames,
  emptyBowlPickem,
  emptyBowlSide,
  mergeOptOuts,
} from '../src/bowlPickem.ts'
import type { TeamRosterFile } from '../src/teamRoster.ts'

test('bowl window is mid-December through late January of the next year', () => {
  assert.equal(isBowlWindowKickoff('2026-12-16T00:00:00.000Z', 2026), true)
  assert.equal(isBowlWindowKickoff('2027-01-21T20:00:00.000Z', 2026), true)
  assert.equal(isBowlWindowKickoff('2026-12-15T23:00:00.000Z', 2026), false)
  assert.equal(isBowlWindowKickoff('2026-11-29T17:00:00.000Z', 2026), false)
  assert.equal(isBowlWindowKickoff('2027-01-22T00:00:00.000Z', 2026), false)
})

test('home spread follows selection / team_side onto the book home team', () => {
  assert.equal(
    homeSpreadFromRow({
      home_team: 'Alabama',
      away_team: 'Michigan',
      selection: 'Michigan',
      line: 7.5,
    }),
    -7.5,
  )
  assert.equal(
    homeSpreadFromRow({
      home_team: 'Alabama',
      away_team: 'Michigan',
      team_side: 'home',
      line: -13,
    }),
    -13,
  )
})

test('harvests DraftKings bowl-window games and ignores regular-season rows', () => {
  const games = bowlGamesFromBookRows(
    [
      {
        event_id: 1,
        event_start_time: '2026-11-22T17:00:00.000Z',
        home_team: 'Ohio State',
        away_team: 'Michigan',
        line: -3,
        team_side: 'home',
        sportsbook: 'draftkings',
        market_type: 'point_spread',
        is_main_line: true,
      },
      {
        event_id: 99,
        event_start_time: '2026-12-27T17:00:00.000Z',
        home_team: 'Oregon',
        away_team: 'Texas',
        line: -6.5,
        team_side: 'home',
        sportsbook: 'draftkings',
        market_type: 'point_spread',
        is_main_line: true,
      },
      {
        event_id: 99,
        event_start_time: '2026-12-27T17:00:00.000Z',
        home_team: 'Oregon',
        away_team: 'Texas',
        line: -10.5,
        team_side: 'home',
        sportsbook: 'draftkings',
        market_type: 'point_spread',
        is_alternate_line: true,
      },
    ],
    2026,
  )
  assert.equal(games.length, 1)
  assert.equal(games[0]?.id, 'dk-99')
  assert.equal(games[0]?.homeSpread, -6.5)
  assert.equal(usableBowlSpread({ is_alternate_line: true, line: -3 }), false)
})

test('merge keeps opt-outs, carry-forwards a dropped future game, and opens the slate', () => {
  const previous = emptyBowlPickem(2026)
  previous.optOuts = mergeOptOuts([], [
    {
      id: 'oregon:qb',
      team: 'Oregon',
      player: 'Star QB',
      position: 'QB',
      reason: 'nfl-draft',
      detail: 'Declared',
      reportedAt: '2026-12-20T00:00:00.000Z',
    },
  ])
  previous.games = [
    {
      id: 'dk-1',
      providerEventId: '1',
      bowlName: 'Rose Bowl',
      kickoff: '2027-01-01T20:00:00.000Z',
      away: emptyBowlSide('Indiana'),
      home: { name: 'Alabama', abbrev: 'BAMA', teamId: 'abc' },
      homeSpread: -4.5,
      spreadUpdatedAt: '2026-12-20T00:00:00.000Z',
    },
  ]

  const { file, changed } = mergeBowlOdds({
    previous,
    seasonYear: 2026,
    runAt: '2026-12-21T00:00:00.000Z',
    games: [
      {
        id: 'dk-2',
        providerEventId: '2',
        bowlName: null,
        kickoff: '2026-12-27T17:00:00.000Z',
        away: emptyBowlSide('Texas'),
        home: emptyBowlSide('Oregon'),
        homeSpread: -6.5,
        spreadUpdatedAt: null,
      },
    ],
  })

  assert.equal(changed, true)
  assert.equal(file.status, 'open')
  assert.equal(file.optOuts[0]?.player, 'Star QB')
  assert.equal(file.games.length, 2)
  const rose = file.games.find((game) => game.bowlName === 'Rose Bowl')
  assert.equal(rose?.home.abbrev, 'BAMA')
  assert.equal(rose?.homeSpread, -4.5)
})

test('empty harvest does not rewrite an awaiting file', () => {
  const previous = emptyBowlPickem(2026)
  const { changed, file } = mergeBowlOdds({
    previous,
    seasonYear: 2026,
    games: [],
    runAt: '2026-10-05T00:00:00.000Z',
  })
  assert.equal(changed, false)
  assert.equal(file.status, 'awaiting-matchups')
})

test('CFBD notes attach a bowl name without clobbering one we already have', () => {
  const named = applyCfbdBowlNames(
    [
      {
        id: 'dk-1',
        providerEventId: '1',
        bowlName: null,
        kickoff: '2027-01-01T20:00:00.000Z',
        away: emptyBowlSide('Indiana'),
        home: emptyBowlSide('Alabama'),
        homeSpread: -3,
        spreadUpdatedAt: null,
      },
      {
        id: 'dk-2',
        providerEventId: '2',
        bowlName: 'Kept Name',
        kickoff: '2026-12-27T17:00:00.000Z',
        away: emptyBowlSide('Texas'),
        home: emptyBowlSide('Oregon'),
        homeSpread: -6,
        spreadUpdatedAt: null,
      },
    ],
    [
      {
        awayTeam: 'Indiana',
        homeTeam: 'Alabama',
        startDate: '2027-01-01T21:00:00.000Z',
        notes: 'Rose Bowl Game',
        seasonType: 'postseason',
      },
      {
        awayTeam: 'Texas',
        homeTeam: 'Oregon',
        startDate: '2026-12-27T17:00:00.000Z',
        notes: 'Should Not Win',
        seasonType: 'postseason',
      },
    ],
  )
  assert.equal(named[0]?.bowlName, 'Rose Bowl Game')
  assert.equal(named[1]?.bowlName, 'Kept Name')
})

test('roster join fills CBS ids from the frozen team list', () => {
  const roster: TeamRosterFile = {
    updatedAt: null,
    teams: [
      {
        sport: 'NCAAF',
        abbrev: 'BAMA',
        name: 'Alabama',
        location: 'Alabama',
        nickname: 'Crimson Tide',
        conference: 'SEC',
        teamId: 'alabama-id',
      },
    ],
  }
  const [game] = attachRosterToBowlGames(
    [
      {
        id: 'dk-1',
        providerEventId: '1',
        bowlName: null,
        kickoff: null,
        away: emptyBowlSide('Indiana'),
        home: emptyBowlSide('Alabama'),
        homeSpread: -3,
        spreadUpdatedAt: null,
      },
    ],
    roster,
  )
  assert.equal(game?.home.abbrev, 'BAMA')
  assert.equal(game?.home.teamId, 'alabama-id')
  assert.equal(game?.away.teamId, null)
})
