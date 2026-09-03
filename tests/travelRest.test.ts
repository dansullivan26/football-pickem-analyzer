import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attachFrozenVenue,
  buildTravelRestIndex,
  classifyRest,
  formatGameTravelLine,
  formatTravelLabel,
  frozenVenueCaptured,
  gameTravelZones,
  restSplitKey,
  shorterRestSide,
  travelSplitKey,
  travelingSide,
} from '../src/travelRest.ts'
import {
  timeZoneFromTeamLabel,
  timeZoneFromVenue,
  travelZones,
} from '../src/timeZones.ts'
import type {
  FrozenRecommendation,
  RecommendationHistory,
  Slate,
  SlateGame,
  Team,
} from '../src/types.ts'

function team(abbrev: string, location: string, extras: Partial<Team> = {}): Team {
  return {
    id: abbrev,
    abbrev,
    name: extras.name ?? location,
    nickname: extras.nickname ?? location,
    location,
    conference: 'Test',
    record: '',
    rank: null,
    pickemPctStraightUp: 50,
    pickemPctAgainstSpread: 50,
    ...extras,
  }
}

function game(
  cbsEventId: number,
  away: Team,
  home: Team,
  extras: Partial<SlateGame> = {},
): SlateGame {
  return {
    id: String(cbsEventId),
    cbsEventId,
    sport: 'NCAAF',
    week: 1,
    status: 'scheduled',
    kickoff: extras.kickoff ?? '2026-08-29T19:00:00-04:00',
    kickoffLabel: 'Sat 7:00 PM ET',
    tv: null,
    away,
    home,
    homeSpread: -3,
    line: 'home -3',
    venue: extras.venue ?? {
      stadium: 'Home Stadium',
      city: 'Stanford',
      state: 'CA',
      indoor: false,
    },
    ...extras,
  }
}

function slateOf(games: SlateGame[]): Slate {
  return {
    source: { fetchedAt: '2026-09-01T00:00:00Z', timezone: 'America/New_York' },
    pool: { name: 'Test', seasonYear: 2026, entriesCount: 25 },
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
  game: SlateGame,
  extras: Partial<FrozenRecommendation> = {},
): FrozenRecommendation {
  return {
    cbsEventId: game.cbsEventId,
    sport: game.sport,
    kickoff: game.kickoff,
    away: game.away.abbrev,
    home: game.home.abbrev,
    homeSpread: game.homeSpread,
    liveHomeSpread: game.homeSpread,
    category: 'slight',
    recommendedSide: 'home',
    hook: null,
    cover: null,
    source: 'line-value',
    pickedSide: 'home',
    strength: 'mild',
    score: 3,
    venue: game.venue ?? null,
    ...extras,
  }
}

function historyOf(games: FrozenRecommendation[]): RecommendationHistory {
  return {
    updatedAt: '2026-09-01T00:00:00Z',
    weeks: [
      {
        week: 1,
        seasonYear: 2026,
        label: 'Week 1',
        capturedAt: '2026-09-01T00:00:00Z',
        scored: false,
        games,
      },
    ],
  }
}

test('timeZoneFromTeamLabel reads states, Fla aliases, and school names', () => {
  assert.equal(timeZoneFromTeamLabel('Hawaii'), 'Pacific/Honolulu')
  assert.equal(timeZoneFromTeamLabel('Alabama'), 'America/Chicago')
  assert.equal(timeZoneFromTeamLabel('Miami (Fla.)'), 'America/New_York')
  assert.equal(timeZoneFromTeamLabel('Miami (OH)'), 'America/New_York')
  assert.equal(timeZoneFromTeamLabel('Florida State'), 'America/New_York')
  assert.equal(timeZoneFromTeamLabel('Boise State'), 'America/Boise')
  assert.equal(timeZoneFromTeamLabel('Stanford'), 'America/Los_Angeles')
})

test('Hawaii traveling to Stanford is three zones east', () => {
  const kickoff = new Date('2026-08-29T19:00:00-04:00')
  const hop = travelZones(
    timeZoneFromTeamLabel('Hawaii'),
    timeZoneFromVenue({
      stadium: 'Stanford Stadium',
      city: 'Stanford',
      state: 'CA',
      indoor: false,
    }),
    kickoff,
  )
  assert.deepEqual(hop, { zones: 3, direction: 'east' })
  assert.equal(formatTravelLabel(3, 'east'), '3 time zones east')
  assert.equal(formatTravelLabel(1, 'west'), '1 time zone west')
  assert.equal(
    formatGameTravelLine(
      {
        awayTravel: { zones: 3, direction: 'east', label: '3 time zones east' },
        homeTravel: null,
        awayRest: null,
        homeRest: null,
      },
      { away: 'Hawaii' },
    ),
    'Hawaii traveling 3 time zones east',
  )
})

test('travel and rest split keys skip same-zone and missing rows', () => {
  assert.equal(travelSplitKey(null), null)
  assert.equal(
    travelSplitKey({ zones: 0, direction: 'same', label: 'Same time zone' }),
    null,
  )
  assert.equal(
    travelSplitKey({ zones: 1, direction: 'west', label: '1 time zone west' }),
    'oneZone',
  )
  assert.equal(
    travelSplitKey({ zones: 2, direction: 'east', label: '2 time zones east' }),
    'twoZones',
  )
  assert.equal(
    travelSplitKey({ zones: 3, direction: 'east', label: '3 time zones east' }),
    'threePlus',
  )
  assert.equal(restSplitKey(null), null)
  assert.equal(restSplitKey({ days: 4, kind: 'short', label: 'Short week · 4d' }), 'short')
  assert.equal(restSplitKey({ days: 14, kind: 'bye', label: 'Off a bye · 14d' }), 'bye')
})

test('travelingSide needs a 2+ hop and shorterRestSide needs a days gap', () => {
  assert.equal(
    travelingSide(
      { zones: 1, direction: 'east', label: '1 time zone east' },
      null,
    ),
    null,
  )
  assert.equal(
    travelingSide(
      { zones: 3, direction: 'east', label: '3 time zones east' },
      { zones: 0, direction: 'same', label: 'Same time zone' },
    ),
    'away',
  )
  assert.equal(
    travelingSide(
      { zones: 2, direction: 'east', label: '2 time zones east' },
      { zones: 3, direction: 'west', label: '3 time zones west' },
    ),
    'home',
  )
  assert.equal(
    travelingSide(
      { zones: 2, direction: 'east', label: '2 time zones east' },
      { zones: 2, direction: 'west', label: '2 time zones west' },
    ),
    null,
  )
  assert.equal(shorterRestSide(null, { days: 7, kind: 'normal', label: 'Normal week · 7d' }), null)
  assert.equal(
    shorterRestSide(
      { days: 4, kind: 'short', label: 'Short week · 4d' },
      { days: 7, kind: 'normal', label: 'Normal week · 7d' },
    ),
    'away',
  )
  assert.equal(
    shorterRestSide(
      { days: 14, kind: 'bye', label: 'Off a bye · 14d' },
      { days: 7, kind: 'normal', label: 'Normal week · 7d' },
    ),
    'home',
  )
})

test('gameTravelZones uses the larger hop on the card', () => {
  assert.equal(gameTravelZones(null), 0)
  assert.equal(
    gameTravelZones({
      awayTravel: { zones: 0, direction: 'same', label: 'Same time zone' },
      homeTravel: null,
      awayRest: null,
      homeRest: null,
    }),
    0,
  )
  assert.equal(
    gameTravelZones({
      awayTravel: { zones: 3, direction: 'east', label: '3 time zones east' },
      homeTravel: { zones: 1, direction: 'west', label: '1 time zone west' },
      awayRest: null,
      homeRest: null,
    }),
    3,
  )
})

test('North Carolina traveling to Dublin is five zones east', () => {
  const hop = travelZones(
    timeZoneFromTeamLabel('North Carolina'),
    timeZoneFromVenue({
      stadium: 'Aviva Stadium',
      city: 'Dublin',
      state: 'IE',
      indoor: false,
    }),
    new Date('2026-08-29T12:00:00-04:00'),
  )
  assert.deepEqual(hop, { zones: 5, direction: 'east' })
})

test('classifyRest only calls a 13+ day gap a bye in the NFL', () => {
  assert.equal(classifyRest(4, 'NCAAF'), 'short')
  assert.equal(classifyRest(6, 'NFL'), 'short')
  assert.equal(classifyRest(7, 'NFL'), 'normal')
  assert.equal(classifyRest(8, 'NCAAF'), 'long')
  assert.equal(classifyRest(14, 'NCAAF'), 'long')
  assert.equal(classifyRest(14, 'NCAAF', true), 'bye')
  assert.equal(classifyRest(14, 'NFL'), 'bye')
})

test('buildTravelRestIndex stamps away travel and Hawaii rest between card games', () => {
  const hawaii = team('HAWAII', 'Hawaii')
  const stanford = team('STNFRD', 'Stanford', { name: 'Stanford' })
  const unlv = team('UNLV', 'UNLV')
  const first = game(1, hawaii, stanford, {
    kickoff: '2026-08-29T19:00:00-04:00',
    venue: {
      stadium: 'Stanford Stadium',
      city: 'Stanford',
      state: 'CA',
      indoor: false,
    },
  })
  const second = game(2, unlv, hawaii, {
    kickoff: '2026-09-05T23:00:00-04:00',
    venue: {
      stadium: 'Ching Complex',
      city: 'Honolulu',
      state: 'Hawaii',
      indoor: false,
    },
  })
  const index = buildTravelRestIndex(
    slateOf([first, second]),
    historyOf([rec(first), rec(second)]),
  )

  const atStanford = index.byEvent.get(1)
  assert.equal(atStanford?.awayTravel?.label, '3 time zones east')
  assert.equal(atStanford?.awayRest, null)

  const atHawaii = index.byEvent.get(2)
  assert.equal(atHawaii?.homeRest?.kind, 'normal')
  assert.equal(atHawaii?.homeRest?.days, 7)
  assert.equal(atHawaii?.awayTravel?.direction, 'west')
})

test('buildTravelRestIndex uses a schedule last-kickoff when the card has no prior', () => {
  const hawaii = team('HAWAII', 'Hawaii')
  const unlv = team('UNLV', 'UNLV')
  const card = game(2, unlv, hawaii, {
    kickoff: '2026-09-05T23:00:00-04:00',
    venue: {
      stadium: 'Ching Complex',
      city: 'Honolulu',
      state: 'Hawaii',
      indoor: false,
    },
  })
  const index = buildTravelRestIndex(slateOf([card]), historyOf([rec(card)]), {
    updatedAt: '2026-09-01T00:00:00Z',
    seasonYear: 2026,
    teams: [
      {
        key: 'NCAAF:HAWAII',
        lastKickoff: '2026-08-29T19:00:00-04:00',
        source: 'cfbd',
        label: "Hawai'i",
      },
    ],
  })

  assert.equal(index.byEvent.get(2)?.homeRest?.days, 7)
  assert.equal(index.byEvent.get(2)?.homeRest?.kind, 'normal')
})

test('attachFrozenVenue writes then locks the slate venue', () => {
  const first = attachFrozenVenue(
    {},
    {
      venue: {
        stadium: 'Stanford Stadium',
        city: 'Stanford',
        state: 'CA',
        indoor: false,
      },
    },
  )
  assert.equal(frozenVenueCaptured(first), true)
  const locked = attachFrozenVenue(
    first,
    {
      venue: {
        stadium: 'Aviva Stadium',
        city: 'Dublin',
        state: 'IE',
        indoor: false,
      },
    },
    true,
  )
  assert.deepEqual(locked, first)
})
