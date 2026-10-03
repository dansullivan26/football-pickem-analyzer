import assert from 'node:assert/strict'
import test from 'node:test'
import type { TeamAppearance } from '../src/teamPerformance.ts'
import type { GameAnalysis, SlateGame } from '../src/types.ts'
import type { UnpickedGame } from '../src/cardStrategy.ts'
import type { NflStarterInjuryTeam } from '../src/nflStarterInjuries.ts'
import {
  buildNeutralPacket,
  emptyNeutralBriefs,
  formatNeutralBriefTag,
  freezeNeutralBrief,
  lookupNeutralBrief,
  parseGeminiBrief,
  type NeutralBrief,
} from '../src/neutralBrief.ts'

function team(overrides: Partial<SlateGame['away']> & Pick<SlateGame['away'], 'id' | 'abbrev' | 'name'>): SlateGame['away'] {
  return {
    nickname: overrides.name,
    location: overrides.name,
    conference: '',
    record: '',
    rank: null,
    pickemPctStraightUp: 0,
    pickemPctAgainstSpread: 0,
    ...overrides,
  }
}

function slateGame(overrides: Partial<SlateGame> = {}): SlateGame {
  return {
    id: 'tenn-tex',
    cbsEventId: 50027885,
    sport: 'NCAAF',
    week: 5,
    status: 'SCHEDULED',
    kickoff: '2026-09-26T15:30:00-04:00',
    kickoffLabel: 'Sat 3:30 PM ET',
    tv: null,
    away: team({ id: 'tenn', abbrev: 'TENN', name: 'Tennessee' }),
    home: team({ id: 'tex', abbrev: 'TEX', name: 'Texas' }),
    homeSpread: -5.5,
    line: 'Texas -5.5',
    ...overrides,
  }
}

function unpicked(overrides: Partial<UnpickedGame> = {}): UnpickedGame {
  const game = slateGame()
  return {
    gameId: game.id,
    cbsEventId: game.cbsEventId,
    away: game.away.name,
    awayAbbrev: game.away.abbrev,
    awayId: game.away.id,
    home: game.home.name,
    homeAbbrev: game.home.abbrev,
    homeId: game.home.id,
    homeSpread: game.homeSpread,
    kickoff: game.kickoff,
    kickoffLabel: game.kickoffLabel,
    reason: 'No line-value, hook, injury, rest, or travel advantage',
    leanSide: 'away',
    leanTeam: 'Tennessee',
    leanSpread: 5.5,
    detail: 'Net 0.10 toward Tennessee',
    ...overrides,
  }
}

function analysis(overrides: Partial<GameAnalysis> = {}): GameAnalysis {
  const game = slateGame()
  return {
    game,
    odds: undefined,
    consensus: {
      gameId: game.id,
      cbsEventId: game.cbsEventId,
      sport: 'NCAAF',
      kickoff: game.kickoff,
      matchStatus: 'matched',
      coversDetailsUrl: null,
      cbsHomeSpread: game.homeSpread,
      away: {
        name: 'Tennessee',
        abbrev: 'TENN',
        coversName: 'Tennessee',
        spread: 5.5,
        pct: 38,
        picks: 38,
      },
      home: {
        name: 'Texas',
        abbrev: 'TEX',
        coversName: 'Texas',
        spread: -5.5,
        pct: 62,
        picks: 62,
      },
    },
    liveHomeSpread: -5.5,
    edge: 0,
    category: 'neutral',
    recommendedSide: null,
    ...overrides,
  }
}

function appearance(
  overrides: Partial<TeamAppearance> & Pick<TeamAppearance, 'cbsEventId'>,
): TeamAppearance {
  return {
    week: overrides.week ?? 1,
    weekLabel: `Week ${overrides.week ?? 1}`,
    kickoff: '2026-09-05T12:00:00-04:00',
    sport: 'NCAAF',
    opponent: 'Rival',
    opponentAbbrev: 'RIV',
    side: overrides.side ?? (overrides.venue === 'away' ? 'away' : 'home'),
    venue: 'home',
    market: 'favorite',
    homeSpread: -7,
    result: 'win',
    awayScore: 10,
    homeScore: 24,
    weather: null,
    travel: null,
    rest: null,
    ...overrides,
  }
}

function brief(overrides: Partial<NeutralBrief> = {}): NeutralBrief {
  return {
    gameId: 'tenn-tex',
    cbsEventId: 50027885,
    week: 5,
    seasonYear: 2026,
    away: 'Tennessee',
    home: 'Texas',
    side: 'away',
    confidence: 'medium',
    why: 'Tennessee is 4-0 ATS on the road in the packet.',
    model: 'gemini-2.5-flash',
    frozenAt: '2026-09-26T12:00:00.000Z',
    ...overrides,
  }
}

test('packet quotes profiles, rest, recent covers, and this week’s number', () => {
  const packet = buildNeutralPacket({
    analysis: analysis(),
    unpicked: unpicked(),
    week: { order: 5, label: 'Week 5' },
    seasonYear: 2026,
    awayTeam: {
      name: 'Tennessee',
      abbrev: 'TENN',
      appearances: [
        appearance({ cbsEventId: 1, week: 1, venue: 'away', market: 'dog', homeSpread: 3, result: 'win', opponent: 'Syracuse' }),
        appearance({ cbsEventId: 2, week: 2, venue: 'home', result: 'win', opponent: 'East Carolina' }),
        appearance({ cbsEventId: 3, week: 3, venue: 'away', result: 'win', opponent: 'Georgia' }),
        appearance({ cbsEventId: 4, week: 4, venue: 'home', result: 'win', opponent: 'UAB' }),
      ],
    },
    homeTeam: {
      name: 'Texas',
      abbrev: 'TEX',
      appearances: [
        appearance({ cbsEventId: 11, week: 1, result: 'loss', opponent: 'Ohio State' }),
        appearance({ cbsEventId: 12, week: 2, result: 'win', opponent: 'San Jose State' }),
      ],
    },
    travelRest: {
      awayTravel: { zones: 1, direction: 'west', label: '1 zone west' },
      homeTravel: { zones: 0, direction: 'same', label: 'home' },
      awayRest: { days: 7, kind: 'normal', label: '7-day week' },
      homeRest: { days: 14, kind: 'long', label: '14-day week' },
    },
    weather: {
      cbsEventId: 50027885,
      seasonYear: 2026,
      week: 5,
      frozenAt: '2026-09-26T12:00:00.000Z',
      kickoff: '2026-09-26T15:30:00-04:00',
      indoor: false,
      wet: false,
      windy: false,
      bucket: 'benign',
      temperature: 78,
      windSpeed: '6 mph',
      shortForecast: 'Sunny',
      precipChance: 10,
    },
  })

  assert.equal(packet.cbsHomeSpread, -5.5)
  assert.equal(packet.dkHomeSpread, -5.5)
  assert.equal(packet.lineEdge, 0)
  assert.equal(packet.lean?.team, 'Tennessee')
  assert.match(packet.weather ?? '', /Comfortable/)
  assert.equal(packet.public?.homePct, 62)
  assert.equal(packet.teams[0]?.profile.archetype, 'Covers ATS')
  assert.equal(packet.teams[0]?.recentCovers[0]?.opponent, 'UAB')
  assert.equal(packet.teams[0]?.rest, 'Tennessee 7-day week')
  assert.equal(packet.teams[0]?.travel, 'Tennessee traveling 1 zone west')
  assert.equal(packet.teams[1]?.rest, 'Texas 14-day week')
  assert.equal(packet.teams[1]?.travel, null)
  assert.equal(packet.teams[1]?.profile.archetype, 'Building profile')
  assert.deepEqual(packet.teams[0]?.injuries, [])
})

test('packet lists NFL injuries from the dump and does not invent weather', () => {
  const injuries: NflStarterInjuryTeam = {
    abbrev: 'PHI',
    name: 'Eagles',
    espnTeamId: '21',
    depthChartAt: null,
    status: 'ok',
    injuries: [
      {
        athleteId: '1',
        name: 'Jalen Hurts',
        position: 'QB',
        status: 'Questionable',
        tier: 'questionable',
        injury: 'Knee',
        detail: null,
        updatedAt: null,
      },
    ],
  }
  const packet = buildNeutralPacket({
    analysis: analysis({
      game: slateGame({
        sport: 'NFL',
        away: team({ id: 'phi', abbrev: 'PHI', name: 'Eagles' }),
        home: team({ id: 'chi', abbrev: 'CHI', name: 'Bears' }),
      }),
    }),
    unpicked: unpicked({ away: 'Eagles', home: 'Bears' }),
    week: { order: 5, label: 'Week 5' },
    seasonYear: 2026,
    awayTeam: { name: 'Eagles', abbrev: 'PHI', appearances: [] },
    homeTeam: { name: 'Bears', abbrev: 'CHI', appearances: [] },
    injuries: { away: injuries },
  })

  assert.equal(packet.weather, null)
  assert.deepEqual(packet.teams[0]?.injuries, ['Jalen Hurts QB Questionable — Knee'])
  assert.deepEqual(packet.teams[1]?.injuries, [])
})

test('first freeze wins unless force is set', () => {
  const first = brief()
  const second = brief({
    side: 'home',
    confidence: 'strong',
    why: 'Texas home covers in the packet.',
    frozenAt: '2026-09-27T12:00:00.000Z',
  })
  const once = freezeNeutralBrief(emptyNeutralBriefs(), first)
  assert.equal(once.wrote, true)
  const kept = freezeNeutralBrief(once.file, second)
  assert.equal(kept.wrote, false)
  assert.equal(kept.file.games[0]?.side, 'away')
  const forced = freezeNeutralBrief(once.file, second, true)
  assert.equal(forced.wrote, true)
  assert.equal(forced.file.games[0]?.side, 'home')
  assert.equal(forced.file.games.length, 1)
})

test('lookup is keyed by game, week, and season', () => {
  const file = freezeNeutralBrief(emptyNeutralBriefs(), brief()).file
  assert.equal(
    lookupNeutralBrief(file, { gameId: 'tenn-tex' }, 5, 2026)?.side,
    'away',
  )
  assert.equal(lookupNeutralBrief(file, { gameId: 'tenn-tex' }, 6, 2026), null)
  assert.equal(lookupNeutralBrief(file, { gameId: 'other' }, 5, 2026), null)
})

test('parseGeminiBrief accepts JSON or a fenced blob and rejects junk', () => {
  assert.deepEqual(
    parseGeminiBrief({
      side: 'away',
      confidence: 'light',
      why: 'Thin sample. Packet only has two graded Texas games.',
    }),
    {
      side: 'away',
      confidence: 'light',
      why: 'Thin sample. Packet only has two graded Texas games.',
    },
  )
  assert.equal(
    parseGeminiBrief('```json\n{"side":"no-call","confidence":"light","why":"Nothing in the packet leans."}\n```')
      ?.side,
    'no-call',
  )
  assert.equal(parseGeminiBrief({ side: 'Tennessee', confidence: 'light', why: 'Nope' }), null)
  assert.equal(parseGeminiBrief({ side: 'away', confidence: 'huge', why: 'Nope' }), null)
  assert.equal(parseGeminiBrief({ side: 'away', confidence: 'light', why: '   ' }), null)
})

test('brief tag names the CBS side and confidence', () => {
  const game = unpicked()
  assert.equal(
    formatNeutralBriefTag(brief(), game),
    'Gemini · Tennessee +5.5 · medium',
  )
  assert.equal(
    formatNeutralBriefTag(brief({ side: 'no-call', confidence: 'light' }), game),
    'Gemini · no call · light',
  )
})
