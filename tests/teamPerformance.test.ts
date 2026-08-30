import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignTeamSlugs,
  buildTeamDirectory,
  marketForSide,
  resultForSide,
  teamSlug,
} from '../src/teamPerformance.ts'
import type {
  FrozenRecommendation,
  RecommendationHistory,
  Slate,
  SlateGame,
  Team,
} from '../src/types.ts'

function team(abbrev: string, name: string, conference = 'BIG12'): Team {
  return {
    id: `id-${abbrev}`,
    abbrev,
    name,
    nickname: name,
    location: name,
    conference,
    record: '0-0',
    rank: null,
    pickemPctStraightUp: 50,
    pickemPctAgainstSpread: 50,
  }
}

function slateGame(
  cbsEventId: number,
  away: Team,
  home: Team,
  homeSpread: number,
  scores?: { awayScore: number; homeScore: number },
): SlateGame {
  return {
    id: `game-${cbsEventId}`,
    cbsEventId,
    sport: 'NCAAF',
    week: 1,
    status: 'SCHEDULED',
    kickoff: '2026-08-29T12:00:00-04:00',
    kickoffLabel: 'Sat Aug 29, 12:00 PM ET',
    tv: null,
    away,
    home,
    homeSpread,
    line: `${home.abbrev} ${homeSpread}`,
    ...scores,
  }
}

function slate(games: SlateGame[]): Slate {
  return {
    source: { fetchedAt: '2026-08-27T12:00:00-04:00', timezone: 'America/Indianapolis' },
    pool: { name: 'Test', seasonYear: 2026, entriesCount: 1 },
    week: {
      label: 'Week 1',
      order: 1,
      gamesOnSlate: games.length,
      ncaafGames: games.length,
      nflGames: 0,
    },
    games,
  }
}

function rec(
  overrides: Partial<FrozenRecommendation> &
    Pick<FrozenRecommendation, 'cbsEventId' | 'away' | 'home' | 'homeSpread'>,
): FrozenRecommendation {
  return {
    sport: 'NCAAF',
    kickoff: '2026-08-29T12:00:00-04:00',
    liveHomeSpread: overrides.homeSpread,
    category: 'slight',
    recommendedSide: 'home',
    hook: null,
    cover: null,
    source: 'line-value',
    pickedSide: 'home',
    strength: 'mild',
    score: 3,
    ...overrides,
  }
}

function history(games: FrozenRecommendation[]): RecommendationHistory {
  return {
    updatedAt: '2026-08-29T18:00:00.000Z',
    weeks: [
      {
        week: 1,
        label: 'Week 1',
        capturedAt: '2026-08-29T18:00:00.000Z',
        scored: false,
        games,
      },
    ],
  }
}

test('marketForSide and resultForSide follow the CBS home number', () => {
  assert.equal(marketForSide('home', -7.5), 'favorite')
  assert.equal(marketForSide('away', -7.5), 'dog')
  assert.equal(marketForSide('home', 3), 'dog')
  assert.equal(marketForSide('away', 0), 'pickem')
  assert.equal(resultForSide('away', 'away'), 'win')
  assert.equal(resultForSide('home', 'away'), 'loss')
  assert.equal(resultForSide('home', 'push'), 'push')
  assert.equal(resultForSide('home', null), null)
})

test('buildTeamDirectory grades both sides and keeps ungraded slate teams', () => {
  const unc = team('UNC', 'North Carolina', 'ACC')
  const tcu = team('TCU', 'TCU', 'BIG12')
  const hawaii = team('HAWAII', 'Hawaii', 'MWC')
  const stanford = team('STNFRD', 'Stanford', 'ACC')
  const directory = buildTeamDirectory(
    slate([
      slateGame(1, unc, tcu, -7.5, { awayScore: 15, homeScore: 10 }),
      slateGame(2, hawaii, stanford, -5.5),
    ]),
    history([
      rec({
        cbsEventId: 1,
        away: 'UNC',
        home: 'TCU',
        homeSpread: -7.5,
        cover: 'away',
      }),
      rec({
        cbsEventId: 2,
        away: 'HAWAII',
        home: 'STNFRD',
        homeSpread: -5.5,
      }),
    ]),
  )

  const tcuRecord = directory.teams.find((row) => row.abbrev === 'TCU')
  const uncRecord = directory.teams.find((row) => row.abbrev === 'UNC')
  const hawaiiRecord = directory.teams.find((row) => row.abbrev === 'HAWAII')

  assert.equal(tcuRecord?.overall.detail, '0-1 ATS')
  assert.equal(tcuRecord?.home.detail, '0-1 ATS')
  assert.equal(tcuRecord?.favorite.detail, '0-1 ATS')
  assert.equal(tcuRecord?.appearances[0]?.opponent, 'North Carolina')
  assert.equal(tcuRecord?.appearances[0]?.awayScore, 15)
  assert.equal(tcuRecord?.appearances[0]?.homeScore, 10)
  assert.equal(
    tcuRecord?.appearances[0]?.kickoff,
    '2026-08-29T12:00:00-04:00',
  )
  assert.equal(hawaiiRecord?.appearances[0]?.awayScore, null)
  assert.equal(hawaiiRecord?.appearances[0]?.homeScore, null)
  assert.equal(uncRecord?.overall.detail, '1-0 ATS')
  assert.equal(uncRecord?.away.detail, '1-0 ATS')
  assert.equal(uncRecord?.dog.detail, '1-0 ATS')
  assert.equal(uncRecord?.appearances[0]?.opponent, 'TCU')
  assert.equal(hawaiiRecord?.overall.pending, 1)
  assert.equal(hawaiiRecord?.overall.rate, '—')
  assert.equal(directory.home.detail, '0-1 ATS')
  assert.equal(directory.away.detail, '1-0 ATS')
  assert.equal(directory.favorite.detail, '0-1 ATS')
  assert.equal(directory.dog.detail, '1-0 ATS')
  assert.equal(tcuRecord?.slug, 'tcu')
  assert.equal(uncRecord?.slug, 'north-carolina')
})

test('buildTeamDirectory keeps a frozen score after the live slate moves on', () => {
  const directory = buildTeamDirectory(
    slate([]),
    history([
      rec({
        cbsEventId: 2,
        away: 'HAWAII',
        home: 'STNFRD',
        homeSpread: -5.5,
        cover: 'home',
        awayScore: 27,
        homeScore: 37,
      }),
    ]),
  )
  const hawaiiRecord = directory.teams.find((row) => row.abbrev === 'HAWAII')
  assert.equal(hawaiiRecord?.appearances[0]?.awayScore, 27)
  assert.equal(hawaiiRecord?.appearances[0]?.homeScore, 37)
})

test('teamSlug turns school names into URL paths', () => {
  assert.equal(teamSlug('Alabama'), 'alabama')
  assert.equal(teamSlug('North Carolina'), 'north-carolina')
  assert.equal(teamSlug('C. Carolina'), 'c-carolina')
  assert.equal(teamSlug('Miami (Fla.)'), 'miami-fla')
  assert.equal(teamSlug('Miami-OH'), 'miami-oh')
})

test('assignTeamSlugs disambiguates the same name in two leagues', () => {
  assert.deepEqual(
    assignTeamSlugs([
      { name: 'Washington', sport: 'NCAAF', abbrev: 'WASH' },
      { name: 'Washington', sport: 'NFL', abbrev: 'WAS' },
    ]),
    ['washington-ncaaf', 'washington-nfl'],
  )
})
