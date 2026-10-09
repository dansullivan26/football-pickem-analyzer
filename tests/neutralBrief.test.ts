import assert from 'node:assert/strict'
import test from 'node:test'
import type { TeamAppearance } from '../src/teamPerformance.ts'
import type { GameAnalysis, SlateGame } from '../src/types.ts'
import type { UnpickedGame } from '../src/cardStrategy.ts'
import type { NflStarterInjuryTeam } from '../src/nflStarterInjuries.ts'
import {
  buildNeutralPacket,
  emptyNeutralBriefs,
  formatNeutralBriefFailure,
  formatGeminiPickTag,
  formatNeutralBriefTag,
  freezeNeutralBrief,
  isNeutralBriefFailed,
  isNeutralBriefOk,
  isGameDayFreshNote,
  isScoutGameDay,
  lookupNeutralBrief,
  parseGeminiBrief,
  selectGameDayScoutAsks,
  selectGamesToAsk,
  summarizeGeminiError,
  type NeutralBrief,
  type NeutralBriefFailed,
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
    model: 'gemini-3.8-flash',
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
  assert.equal(packet.teams[0]?.role, 'road dog')
  assert.equal(packet.teams[1]?.role, 'home favorite')
  assert.match(packet.teams[0]?.splits.away ?? '', /2-0 ATS/)
  assert.match(packet.teams[0]?.splits.dog ?? '', /1-0 ATS/)
  assert.match(packet.teams[0]?.situation.site ?? '', /2-0 ATS/)
  assert.match(packet.teams[0]?.situation.market ?? '', /1-0 ATS/)
  assert.equal(packet.teams[0]?.rest, 'Tennessee 7-day week')
  assert.equal(packet.teams[0]?.travel, 'Tennessee traveling 1 zone west')
  assert.equal(packet.teams[1]?.rest, 'Texas 14-day week')
  assert.equal(packet.teams[1]?.travel, null)
  assert.equal(packet.teams[1]?.profile.archetype, 'Building profile')
  assert.deepEqual(packet.teams[0]?.injuries, [])
  assert.equal(packet.cardPick, null)
  assert.equal(packet.linePath, null)
  assert.equal(packet.pool, null)

  const withCard = buildNeutralPacket({
    analysis: analysis(),
    unpicked: unpicked(),
    cardPick: {
      side: 'home',
      team: 'Texas',
      spread: -5.5,
      detail: '0.10-point net edge',
      source: 'line-value',
    },
    week: { order: 5, label: 'Week 5' },
    seasonYear: 2026,
    awayTeam: { name: 'Tennessee', abbrev: 'TENN', appearances: [] },
    homeTeam: { name: 'Texas', abbrev: 'TEX', appearances: [] },
  })
  assert.equal(withCard.cardPick?.team, 'Texas')
  assert.equal(withCard.cardDetail, '0.10-point net edge')
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

test('a later successful note overwrites the paragraph', () => {
  const first = brief()
  const second = brief({
    side: 'home',
    confidence: 'strong',
    why: 'Texas home covers in the packet.',
    frozenAt: '2026-09-27T12:00:00.000Z',
  })
  const once = freezeNeutralBrief(emptyNeutralBriefs(), first)
  assert.equal(once.wrote, true)
  const next = freezeNeutralBrief(once.file, second)
  assert.equal(next.wrote, true)
  assert.equal(next.file.games[0] && isNeutralBriefOk(next.file.games[0])
    ? next.file.games[0].side
    : null, 'home')
  assert.equal(next.file.games.length, 1)
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
    'Scout · Tennessee +5.5 · medium',
  )
  assert.equal(
    formatNeutralBriefTag(brief({ side: 'no-call', confidence: 'light' }), game),
    'Scout · no call · light',
  )
})

function failed(overrides: Partial<NeutralBriefFailed> = {}): NeutralBriefFailed {
  return {
    status: 'failed',
    gameId: 'tenn-tex',
    cbsEventId: 50027885,
    week: 5,
    seasonYear: 2026,
    away: 'Tennessee',
    home: 'Texas',
    error: '503 high demand',
    model: 'gemini-3.8-flash',
    attemptedAt: '2026-10-03T05:50:38.793Z',
    ...overrides,
  }
}

test('a 503 is stored and can be overwritten by a later freeze', () => {
  const once = freezeNeutralBrief(emptyNeutralBriefs(), failed())
  assert.equal(once.wrote, true)
  assert.equal(isNeutralBriefFailed(once.file.games[0]), true)
  const kept = freezeNeutralBrief(
    once.file,
    failed({ error: '503 high demand', attemptedAt: '2026-10-03T06:00:00.000Z' }),
  )
  assert.equal(kept.wrote, true)
  assert.equal(kept.file.games[0] && isNeutralBriefFailed(kept.file.games[0])
    ? kept.file.games[0].attemptedAt
    : null, '2026-10-03T06:00:00.000Z')
  const frozen = freezeNeutralBrief(kept.file, brief())
  assert.equal(frozen.wrote, true)
  assert.equal(isNeutralBriefOk(frozen.file.games[0]), true)
  assert.equal(frozen.file.games[0] && isNeutralBriefOk(frozen.file.games[0])
    ? frozen.file.games[0].side
    : null, 'away')
})

test('a successful freeze is not replaced by a later 503', () => {
  const once = freezeNeutralBrief(emptyNeutralBriefs(), brief())
  const blocked = freezeNeutralBrief(once.file, failed())
  assert.equal(blocked.wrote, false)
  assert.equal(isNeutralBriefOk(blocked.file.games[0]), true)
})

test('failure copy tells the operator the next run will retry', () => {
  assert.equal(summarizeGeminiError('Gemini 503: high demand'), '503 high demand')
  assert.equal(summarizeGeminiError('OpenAI 429: rate limit'), '429 rate limit')
  assert.equal(summarizeGeminiError('Anthropic 529: overloaded'), '503 high demand')
  assert.equal(
    formatNeutralBriefFailure(failed()),
    'Scout was busy (503). The next scout run will try this game again.',
  )
  assert.equal(
    formatNeutralBriefTag(failed(), unpicked()),
    'Scout failed · try again',
  )
})

test('ask queue prefers missing, then failed, then the oldest paragraph', () => {
  const asked = selectGamesToAsk(
    [
      {
        gameId: 'old-ok',
        cbsEventId: 3,
        brief: brief({
          gameId: 'old-ok',
          cbsEventId: 3,
          frozenAt: '2026-10-01T12:00:00.000Z',
        }),
      },
      {
        gameId: 'failed',
        cbsEventId: 2,
        brief: failed({ gameId: 'failed', cbsEventId: 2 }),
      },
      { gameId: 'missing', cbsEventId: 1, brief: null },
      {
        gameId: 'new-ok',
        cbsEventId: 4,
        brief: brief({
          gameId: 'new-ok',
          cbsEventId: 4,
          frozenAt: '2026-10-03T12:00:00.000Z',
        }),
      },
    ],
    3,
  )
  assert.deepEqual(
    asked.map((row) => row.gameId),
    ['missing', 'failed', 'old-ok'],
  )
})

test('leftover-only queue skips algorithm recs', () => {
  const asked = selectGamesToAsk(
    [
      { gameId: 'rec', cbsEventId: 1, leftover: false, brief: null },
      { gameId: 'leftover', cbsEventId: 2, leftover: true, brief: null },
      { gameId: 'other-rec', cbsEventId: 3, leftover: false, brief: null },
    ],
    4,
    true,
  )
  assert.deepEqual(
    asked.map((row) => row.gameId),
    ['leftover'],
  )
})

test('packet includes line path, pool expected, and head-to-head covers', () => {
  const packet = buildNeutralPacket({
    analysis: analysis(),
    unpicked: unpicked(),
    week: { order: 5, label: 'Week 5' },
    seasonYear: 2026,
    awayTeam: {
      name: 'Tennessee',
      abbrev: 'TENN',
      appearances: [
        appearance({
          cbsEventId: 21,
          week: 2,
          venue: 'away',
          market: 'dog',
          homeSpread: 3.5,
          result: 'win',
          opponent: 'Texas',
          opponentAbbrev: 'TEX',
        }),
      ],
    },
    homeTeam: {
      name: 'Texas',
      abbrev: 'TEX',
      appearances: [
        appearance({
          cbsEventId: 21,
          week: 2,
          venue: 'home',
          market: 'favorite',
          homeSpread: -3.5,
          result: 'loss',
          opponent: 'Tennessee',
          opponentAbbrev: 'TENN',
        }),
      ],
    },
    lineTicks: [{ home: -7 }, { home: -6 }, { home: -5.5 }],
    pool: { home: 4, away: 9, unknown: 3, called: 13 },
  })

  assert.equal(packet.linePath, '-7 → -6 → -5.5')
  assert.deepEqual(packet.pool, { home: 4, away: 9, unknown: 3, called: 13 })
  assert.equal(packet.teams[0]?.vsOpponent[0]?.opponent, 'Texas')
  assert.equal(packet.teams[0]?.vsOpponent[0]?.result, 'win')
  assert.equal(packet.teams[1]?.vsOpponent[0]?.opponent, 'Tennessee')
  assert.equal(packet.teams[1]?.vsOpponent[0]?.result, 'loss')
})

test('game-day gate waits until the ET kickoff day', () => {
  const saturdayKick = '2026-10-10T15:30:00-04:00'
  const fridayAfternoon = new Date('2026-10-09T18:00:00-04:00')
  const saturdayMorning = new Date('2026-10-10T08:00:00-04:00')
  assert.equal(isScoutGameDay(saturdayKick, fridayAfternoon), false)
  assert.equal(isScoutGameDay(saturdayKick, saturdayMorning), true)
  assert.equal(isScoutGameDay('2026-10-11T13:00:00-04:00', saturdayMorning), false)
})

test('a note written before game day is stale; a same-day note is fresh', () => {
  const saturdayKick = '2026-10-10T15:30:00-04:00'
  const fridayNote = brief({ frozenAt: '2026-10-09T18:46:38.808Z' })
  const saturdayNote = brief({ frozenAt: '2026-10-10T12:00:00.000Z' })
  assert.equal(isGameDayFreshNote(fridayNote, saturdayKick), false)
  assert.equal(isGameDayFreshNote(saturdayNote, saturdayKick), true)
  assert.equal(isGameDayFreshNote(failed(), saturdayKick), false)
  assert.equal(isGameDayFreshNote(null, saturdayKick), false)
})

test('game-day queue skips other days, prefers leftovers, and skips fresh notes', () => {
  const saturdayKick = '2026-10-10T15:30:00-04:00'
  const sundayKick = '2026-10-11T13:00:00-04:00'
  const saturdayMorning = new Date('2026-10-10T08:00:00-04:00')
  const fridayNote = brief({
    gameId: 'ucla-ore',
    cbsEventId: 1,
    frozenAt: '2026-10-09T18:46:38.808Z',
  })
  const saturdayNote = brief({
    gameId: 'fresh-rec',
    cbsEventId: 4,
    frozenAt: '2026-10-10T12:00:00.000Z',
  })
  const candidates = [
    {
      gameId: 'sunday-nfl',
      cbsEventId: 5,
      leftover: false,
      kickoff: sundayKick,
      brief: null,
    },
    {
      gameId: 'fresh-rec',
      cbsEventId: 4,
      leftover: false,
      kickoff: saturdayKick,
      brief: saturdayNote,
    },
    {
      gameId: 'sat-rec',
      cbsEventId: 3,
      leftover: false,
      kickoff: saturdayKick,
      brief: null,
    },
    {
      gameId: 'ucla-ore',
      cbsEventId: 1,
      leftover: true,
      kickoff: saturdayKick,
      brief: fridayNote,
    },
    {
      gameId: 'sat-leftover-missing',
      cbsEventId: 2,
      leftover: true,
      kickoff: saturdayKick,
      brief: null,
    },
  ]

  assert.deepEqual(
    selectGameDayScoutAsks(candidates, 6, saturdayMorning).map((row) => row.gameId),
    ['sat-leftover-missing', 'ucla-ore', 'sat-rec'],
  )
  assert.deepEqual(
    selectGameDayScoutAsks(candidates, 6, new Date('2026-10-09T18:00:00-04:00')).map(
      (row) => row.gameId,
    ),
    [],
  )
  assert.deepEqual(
    selectGameDayScoutAsks(candidates, 6, saturdayMorning, true).map((row) => row.gameId),
    ['sat-leftover-missing', 'ucla-ore', 'sat-rec', 'fresh-rec'],
  )
})

test('pick-row tag marks agreement or a Gemini lean', () => {
  const pick = {
    away: 'Tennessee',
    home: 'Texas',
    pickedSide: 'home' as const,
    poolSpread: -5.5,
  }
  assert.equal(
    formatGeminiPickTag(brief({ side: 'home', confidence: 'light' }), pick),
    'Gemini agrees · light',
  )
  assert.equal(
    formatGeminiPickTag(brief({ side: 'away', confidence: 'medium' }), pick),
    'Gemini leans Tennessee +5.5 · medium',
  )
})
