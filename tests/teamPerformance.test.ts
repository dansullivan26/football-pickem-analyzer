import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignTeamSlugs,
  buildTeamDirectory,
  formatRankedTeamName,
  marketForSide,
  resultForSide,
  teamKey,
  teamPageSlugs,
  teamSlug,
} from '../src/teamPerformance.ts'
import { weatherFromConditions } from '../src/weatherBuckets.ts'
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
  assert.equal(tcuRecord?.location, 'TCU')
  assert.equal(tcuRecord?.nickname, 'TCU')
  assert.equal(uncRecord?.slug, 'north-carolina')
  assert.equal(tcuRecord?.appearances[0]?.weather, null)
  assert.equal(tcuRecord?.benign.games, 0)
})

test('buildTeamDirectory weather splits only count frozen buckets', () => {
  const unc = team('UNC', 'North Carolina', 'ACC')
  const tcu = team('TCU', 'TCU', 'BIG12')
  const directory = buildTeamDirectory(
    slate([slateGame(1, unc, tcu, -7.5)]),
    history([
      rec({
        cbsEventId: 1,
        away: 'UNC',
        home: 'TCU',
        homeSpread: -7.5,
        cover: 'away',
      }),
    ]),
    {
      updatedAt: '2026-08-30T00:00:00.000Z',
      games: [
        weatherFromConditions(
          {
            cbsEventId: 1,
            seasonYear: 2026,
            week: 1,
            kickoff: '2026-08-29T12:00:00-04:00',
          },
          {
            temperature: 58,
            windSpeed: '18 mph',
            shortForecast: 'Rain',
            precipChance: 70,
          },
        ),
      ],
    },
  )
  const tcuRecord = directory.teams.find((row) => row.abbrev === 'TCU')
  assert.equal(tcuRecord?.adverse.detail, '0-1 ATS')
  assert.equal(tcuRecord?.wet.detail, '0-1 ATS')
  assert.equal(tcuRecord?.windy.detail, '0-1 ATS')
  assert.equal(tcuRecord?.hot.games, 0)
  assert.equal(tcuRecord?.cold.games, 0)
  assert.equal(tcuRecord?.benign.games, 0)
  assert.equal(directory.adverse.detail, '1-1 ATS')
})

test('buildTeamDirectory hot and cold splits follow the frozen temperature', () => {
  const unc = team('UNC', 'North Carolina', 'ACC')
  const tcu = team('TCU', 'TCU', 'BIG12')
  const directory = buildTeamDirectory(
    slate([
      slateGame(1, unc, tcu, -7.5),
      slateGame(2, unc, tcu, -3.5),
    ]),
    history([
      rec({
        cbsEventId: 1,
        away: 'UNC',
        home: 'TCU',
        homeSpread: -7.5,
        cover: 'home',
      }),
      rec({
        cbsEventId: 2,
        away: 'UNC',
        home: 'TCU',
        homeSpread: -3.5,
        cover: 'away',
      }),
    ]),
    {
      updatedAt: '2026-08-30T00:00:00.000Z',
      games: [
        weatherFromConditions(
          {
            cbsEventId: 1,
            seasonYear: 2026,
            week: 1,
            kickoff: '2026-08-29T12:00:00-04:00',
          },
          {
            temperature: 91,
            windSpeed: '6 mph',
            shortForecast: 'Sunny',
            precipChance: 5,
          },
        ),
        weatherFromConditions(
          {
            cbsEventId: 2,
            seasonYear: 2026,
            week: 2,
            kickoff: '2026-11-21T12:00:00-05:00',
          },
          {
            temperature: 28,
            windSpeed: '8 mph',
            shortForecast: 'Cloudy',
            precipChance: 10,
          },
        ),
      ],
    },
  )
  const tcuRecord = directory.teams.find((row) => row.abbrev === 'TCU')
  assert.equal(tcuRecord?.hot.detail, '1-0 ATS')
  assert.equal(tcuRecord?.cold.detail, '0-1 ATS')
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
  assert.equal(hawaiiRecord?.location, null)
  assert.equal(hawaiiRecord?.nickname, null)
})

test('formatRankedTeamName prefixes a CBS rank when present', () => {
  assert.equal(formatRankedTeamName('Miami (Fla.)', 7), '#7 Miami (Fla.)')
  assert.equal(formatRankedTeamName('Stanford', null), 'Stanford')
})

test('buildTeamDirectory reads stamped rec ranks and falls back to the live slate', () => {
  const miami = { ...team('MIAMI', 'Miami (Fla.)', 'ACC'), rank: 7 }
  const stanford = team('STNFRD', 'Stanford', 'ACC')
  const directory = buildTeamDirectory(
    slate([slateGame(1, miami, stanford, -24.5)]),
    history([
      rec({
        cbsEventId: 1,
        away: 'MIAMI',
        home: 'STNFRD',
        homeSpread: -24.5,
      }),
      rec({
        cbsEventId: 2,
        away: 'MIAMI',
        home: 'STNFRD',
        homeSpread: -21.5,
        awayRank: 5,
        homeRank: null,
      }),
    ]),
  )
  const miamiRecord = directory.teams.find((row) => row.abbrev === 'MIAMI')
  assert.equal(miamiRecord?.appearances[0]?.rank, 7)
  assert.equal(miamiRecord?.appearances[0]?.opponentRank, null)
  assert.equal(miamiRecord?.appearances[1]?.rank, 5)
  assert.equal(miamiRecord?.appearances[1]?.opponentRank, null)
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

test('teamPageSlugs matches the Teams directory for slate sides', () => {
  const unc = team('UNC', 'North Carolina', 'ACC')
  const tcu = team('TCU', 'TCU', 'BIG12')
  const card = slate([slateGame(1, unc, tcu, -7.5)])
  const recs = history([])
  const directory = buildTeamDirectory(card, recs)
  const slugs = teamPageSlugs(card, recs)
  const uncRecord = directory.teams.find((row) => row.abbrev === 'UNC')
  assert.equal(slugs.get(teamKey('NCAAF', 'UNC')), uncRecord?.slug)
  assert.equal(slugs.get(teamKey('NCAAF', 'TCU')), 'tcu')
})
