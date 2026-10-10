import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatSuggestedCardText,
  formatSuggestedDayCardText,
  groupCardRowsByDay,
  orderCardRows,
  type SuggestedCard,
  type SuggestedPick,
} from '../src/cardStrategy.ts'
import {
  backfillNamedPlays,
  dayPlayReady,
  firstCardKickoff,
  formatNamedPlayAsOf,
  freezeNamedPlays,
  namedPlayGames,
  namedPlayKindForGame,
  namedPlayFreezeAt,
  resolveDayNamedPlay,
  resolveWeekNamedPlay,
  weekPlayReady,
} from '../src/namedPlays.ts'
import type { FrozenRecommendation, RecommendationWeek } from '../src/types.ts'

function pick(
  overrides: Partial<SuggestedPick> & Pick<SuggestedPick, 'gameId' | 'kickoff'>,
): SuggestedPick {
  return {
    cbsEventId: Number(overrides.gameId.replace(/\D/g, '') || 1),
    away: 'Away',
    awayAbbrev: 'AWAY',
    awayId: 'away',
    home: 'Home',
    homeAbbrev: 'HOME',
    homeId: 'home',
    kickoffLabel: 'Sun 1:00 PM',
    pickedSide: 'away',
    pickedTeamId: 'away',
    pickedTeam: 'Away',
    poolSpread: -3,
    source: 'line-value',
    category: 'slight',
    edge: 1,
    strength: 'mild',
    hook: null,
    publicSupport: 'none',
    publicPct: null,
    score: 3,
    compositeEdge: 1,
    detail: '1-point line value',
    ...overrides,
  }
}

function frozen(
  overrides: Partial<FrozenRecommendation> &
    Pick<FrozenRecommendation, 'cbsEventId' | 'kickoff'>,
): FrozenRecommendation {
  return {
    sport: 'NFL',
    away: 'AWAY',
    home: 'HOME',
    homeSpread: -3,
    liveHomeSpread: -3,
    category: 'slight',
    recommendedSide: 'away',
    hook: null,
    cover: null,
    source: 'line-value',
    pickedSide: 'away',
    strength: 'mild',
    score: 3,
    compositeEdge: 1,
    ...overrides,
  }
}

const saturdayNoon = '2026-09-19T12:00:00-04:00'
const sundayOne = '2026-09-20T13:00:00-04:00'
const fridayAfternoon = Date.parse('2026-09-18T15:00:00-04:00')
const saturdayMorning = Date.parse('2026-09-19T08:00:00-04:00')
const saturdayNight = Date.parse('2026-09-19T23:00:00-04:00')
const sundayMorning = Date.parse('2026-09-20T08:00:00-04:00')

test('named plays freeze at 8:00 AM ET the morning of that day', () => {
  const freeze = namedPlayFreezeAt(saturdayNoon)
  assert.ok(freeze)
  assert.equal(formatNamedPlayAsOf(freeze.toISOString()), 'Sat 8:00 AM ET')
  assert.equal(weekPlayReady([{ kickoff: saturdayNoon }], fridayAfternoon), false)
  assert.equal(weekPlayReady([{ kickoff: saturdayNoon }], saturdayMorning), true)
  assert.equal(dayPlayReady('2026-09-20', saturdayNight), false)
  assert.equal(dayPlayReady('2026-09-20', sundayMorning), true)
  assert.equal(firstCardKickoff([{ kickoff: sundayOne }, { kickoff: saturdayNoon }]), saturdayNoon)
})

test('play of the week stays hidden until the first-game morning', () => {
  const card: SuggestedCard = {
    strategyId: 'test',
    title: 'ATS Card',
    strategyNote: 'note',
    generatedAt: '2026-09-18T12:00:00.000Z',
    seasonYear: 2026,
    week: 3,
    weekLabel: 'Week 3',
    picks: [
      pick({
        gameId: 'sat',
        cbsEventId: 11,
        kickoff: saturdayNoon,
        awayAbbrev: 'UNC',
        poolSpread: 3.5,
      }),
      pick({
        gameId: 'sun',
        cbsEventId: 22,
        kickoff: sundayOne,
        awayAbbrev: 'KC',
        poolSpread: 5.5,
        category: 'lock',
        compositeEdge: 4.2,
      }),
    ],
    unpicked: [],
    tiebreaker: null,
  }

  assert.equal(
    formatSuggestedCardText(
      card,
      card.picks,
      new Set(),
      null,
      new Map(),
      'slate',
      { now: fridayAfternoon },
    ),
    'Saturday:\n\nUNC +3.5 (light - line value on +2.5)\n\nSunday:\n\nKC +5.5 (strong - line value on +4.5)',
  )
  assert.equal(
    resolveWeekNamedPlay(card.picks, card.picks, { now: fridayAfternoon }),
    null,
  )
})

test('a frozen Saturday play of the week does not move to Sunday', () => {
  const sat = pick({
    gameId: 'sat',
    cbsEventId: 11,
    kickoff: saturdayNoon,
    awayAbbrev: 'UNC',
    poolSpread: 3.5,
    compositeEdge: 1,
  })
  const sun = pick({
    gameId: 'sun',
    cbsEventId: 22,
    kickoff: sundayOne,
    awayAbbrev: 'KC',
    poolSpread: 5.5,
    category: 'lock',
    compositeEdge: 4.2,
  })
  const card: SuggestedCard = {
    strategyId: 'test',
    title: 'ATS Card',
    strategyNote: 'note',
    generatedAt: '2026-09-20T12:00:00.000Z',
    seasonYear: 2026,
    week: 3,
    weekLabel: 'Week 3',
    picks: [sat, sun],
    unpicked: [],
    tiebreaker: null,
  }

  assert.equal(
    formatSuggestedCardText(
      card,
      card.picks,
      new Set(),
      null,
      new Map(),
      'slate',
      {
        playOfTheWeek: {
          cbsEventId: 11,
          frozenAt: '2026-09-19T12:00:00.000Z',
        },
        now: saturdayNight,
      },
    ),
    'Play of the week (as of Sat 8:00 AM ET): UNC +3.5 (light - line value on +2.5)\n\nSaturday:\n\nUNC +3.5 (light - line value on +2.5 — play of the week)\n\nSunday:\n\nKC +5.5 (strong - line value on +4.5)',
  )
})

test('copy day names that day even when play of the week is elsewhere', () => {
  const card: SuggestedCard = {
    strategyId: 'test',
    title: 'ATS Card',
    strategyNote: 'note',
    generatedAt: '2026-09-20T12:00:00.000Z',
    seasonYear: 2026,
    week: 3,
    weekLabel: 'Week 3',
    picks: [
      pick({
        gameId: 'sat-unc',
        cbsEventId: 11,
        kickoff: saturdayNoon,
        awayAbbrev: 'UNC',
        poolSpread: 3.5,
        compositeEdge: 1.4,
      }),
      pick({
        gameId: 'sat-ind',
        cbsEventId: 12,
        kickoff: saturdayNoon,
        awayAbbrev: 'IND',
        poolSpread: -3,
        compositeEdge: 0.6,
      }),
      pick({
        gameId: 'sun',
        cbsEventId: 22,
        kickoff: sundayOne,
        awayAbbrev: 'KC',
        poolSpread: 5.5,
        category: 'lock',
        compositeEdge: 4.2,
      }),
    ],
    unpicked: [],
    tiebreaker: null,
  }
  const saturday = groupCardRowsByDay(
    orderCardRows(card.picks, card.unpicked, 'slate'),
  )[0]
  assert.ok(saturday)
  assert.equal(
    formatSuggestedDayCardText(saturday, card.picks, new Set(), new Map(), {
      playOfTheWeek: {
        cbsEventId: 22,
        frozenAt: '2026-09-19T12:00:00.000Z',
      },
      now: sundayMorning,
    }),
    'Play of the day (as of Sat 8:00 AM ET): UNC +3.5 (light - line value on +2.5)\n\n12:00 PM\n\nUNC +3.5 (light - line value on +2.5 — play of the day)\nIND -3 (light - line value on -4)',
  )
})

test('freezeNamedPlays locks once and waits until morning', () => {
  const games = [
    frozen({
      cbsEventId: 11,
      kickoff: saturdayNoon,
      away: 'UNC',
      compositeEdge: 1,
    }),
    frozen({
      cbsEventId: 22,
      kickoff: sundayOne,
      away: 'KC',
      category: 'lock',
      compositeEdge: 4.2,
    }),
  ]

  const friday = freezeNamedPlays(
    games,
    null,
    '2026-09-18T19:00:00.000Z',
    fridayAfternoon,
  )
  assert.equal(friday.playOfTheWeek, null)
  assert.deepEqual(friday.playsOfTheDay, [])

  const satAm = freezeNamedPlays(
    games,
    friday,
    '2026-09-19T12:05:00.000Z',
    saturdayMorning,
  )
  assert.deepEqual(satAm.playOfTheWeek, {
    cbsEventId: 22,
    frozenAt: '2026-09-19T12:05:00.000Z',
  })
  assert.deepEqual(satAm.playsOfTheDay, [])

  const later = freezeNamedPlays(
    [
      frozen({
        cbsEventId: 11,
        kickoff: saturdayNoon,
        compositeEdge: 0.4,
      }),
      frozen({
        cbsEventId: 22,
        kickoff: sundayOne,
        category: 'lock',
        compositeEdge: 6,
      }),
      frozen({
        cbsEventId: 33,
        kickoff: sundayOne,
        category: 'lock',
        compositeEdge: 9,
        away: 'SF',
      }),
    ],
    satAm,
    '2026-09-20T16:00:00.000Z',
    sundayMorning,
  )
  assert.deepEqual(later.playOfTheWeek, satAm.playOfTheWeek)
  assert.deepEqual(later.playsOfTheDay, [
    { cbsEventId: 33, frozenAt: '2026-09-20T16:00:00.000Z' },
  ])
})

test('named play performance helpers read the stamps', () => {
  const week: RecommendationWeek = {
    week: 3,
    seasonYear: 2026,
    label: 'Week 3',
    capturedAt: '2026-09-20T12:00:00.000Z',
    scored: true,
    playOfTheWeek: { cbsEventId: 11, frozenAt: '2026-09-19T12:00:00.000Z' },
    playsOfTheDay: [
      { cbsEventId: 11, frozenAt: '2026-09-19T12:00:00.000Z' },
      { cbsEventId: 22, frozenAt: '2026-09-20T12:00:00.000Z' },
      { cbsEventId: 4, frozenAt: '2026-09-17T12:00:00.000Z' },
    ],
    games: [
      frozen({
        cbsEventId: 11,
        kickoff: saturdayNoon,
        pickedSide: 'away',
        cover: 'away',
      }),
      frozen({
        cbsEventId: 12,
        kickoff: saturdayNoon,
        pickedSide: 'home',
        cover: 'home',
      }),
      frozen({
        cbsEventId: 22,
        kickoff: sundayOne,
        pickedSide: 'away',
        cover: 'home',
      }),
      frozen({
        cbsEventId: 4,
        kickoff: '2026-09-17T20:15:00-04:00',
        pickedSide: 'away',
        cover: 'away',
      }),
    ],
  }

  assert.equal(namedPlayKindForGame(week, 11), 'week')
  assert.equal(namedPlayKindForGame(week, 22), null)
  assert.equal(namedPlayKindForGame(week, 4), null)
  assert.equal(namedPlayGames([week], 'week').length, 1)
  assert.equal(namedPlayGames([week], 'day').length, 1)
  assert.equal(namedPlayGames([week], 'day')[0]?.cbsEventId, 11)
})

test('backfillNamedPlays reconstructs missing stamps from the frozen card', () => {
  const week: RecommendationWeek = {
    week: 3,
    seasonYear: 2026,
    label: 'Week 3',
    capturedAt: '2026-09-20T12:00:00.000Z',
    scored: true,
    games: [
      frozen({
        cbsEventId: 11,
        kickoff: saturdayNoon,
        compositeEdge: 1,
      }),
      frozen({
        cbsEventId: 22,
        kickoff: sundayOne,
        category: 'lock',
        compositeEdge: 4.2,
      }),
    ],
  }
  const filled = backfillNamedPlays(week, sundayMorning)
  const saturdayFreeze = namedPlayFreezeAt(saturdayNoon)
  const sundayFreeze = namedPlayFreezeAt(sundayOne)
  assert.ok(saturdayFreeze)
  assert.ok(sundayFreeze)
  assert.deepEqual(filled.playOfTheWeek, {
    cbsEventId: 22,
    frozenAt: saturdayFreeze.toISOString(),
    backfilled: true,
  })
  assert.deepEqual(filled.playsOfTheDay, [])

  const live: RecommendationWeek = {
    ...week,
    playOfTheWeek: {
      cbsEventId: 11,
      frozenAt: '2026-09-19T12:05:00.000Z',
    },
    playsOfTheDay: [
      { cbsEventId: 11, frozenAt: '2026-09-19T12:05:00.000Z' },
    ],
  }
  const kept = backfillNamedPlays(live, sundayMorning)
  assert.equal(kept.playOfTheWeek?.cbsEventId, 11)
  assert.equal(kept.playOfTheWeek?.backfilled, undefined)
  assert.deepEqual(kept.playsOfTheDay, [])
})

test('play of the day needs a second game that day', () => {
  const thursday = '2026-09-17T20:15:00-04:00'
  const thursdayMorning = Date.parse('2026-09-17T08:00:00-04:00')
  const locked = freezeNamedPlays(
    [
      frozen({
        cbsEventId: 4,
        kickoff: thursday,
        category: 'lock',
        compositeEdge: 5,
      }),
    ],
    null,
    '2026-09-17T12:00:00.000Z',
    thursdayMorning,
  )
  assert.equal(locked.playOfTheWeek?.cbsEventId, 4)
  assert.deepEqual(locked.playsOfTheDay, [])

  const saturday = freezeNamedPlays(
    [
      frozen({
        cbsEventId: 11,
        kickoff: saturdayNoon,
        compositeEdge: 1.2,
      }),
      frozen({
        cbsEventId: 12,
        kickoff: saturdayNoon,
        compositeEdge: 0.4,
      }),
    ],
    null,
    '2026-09-19T12:05:00.000Z',
    saturdayMorning,
  )
  assert.deepEqual(saturday.playsOfTheDay, [
    { cbsEventId: 11, frozenAt: '2026-09-19T12:05:00.000Z' },
  ])
})

test('play of the day follows the live #1 until that day’s first kickoff', () => {
  const morning = freezeNamedPlays(
    [
      frozen({
        cbsEventId: 95,
        kickoff: saturdayNoon,
        away: 'LSU',
        home: 'UK',
        category: 'lean',
        compositeEdge: 2.25,
      }),
      frozen({
        cbsEventId: 93,
        kickoff: saturdayNoon,
        away: 'DUKE',
        home: 'GATECH',
        category: 'slight',
        compositeEdge: 1.75,
      }),
    ],
    null,
    '2026-09-19T12:05:00.000Z',
    saturdayMorning,
  )
  assert.deepEqual(morning.playsOfTheDay, [
    { cbsEventId: 95, frozenAt: '2026-09-19T12:05:00.000Z' },
  ])

  const prekick = freezeNamedPlays(
    [
      frozen({
        cbsEventId: 95,
        kickoff: saturdayNoon,
        away: 'LSU',
        home: 'UK',
        category: 'slight',
        compositeEdge: 1.25,
      }),
      frozen({
        cbsEventId: 93,
        kickoff: saturdayNoon,
        away: 'DUKE',
        home: 'GATECH',
        category: 'lean',
        compositeEdge: 2.75,
      }),
    ],
    morning,
    '2026-09-19T15:28:00.000Z',
    Date.parse('2026-09-19T11:28:00-04:00'),
  )
  assert.deepEqual(prekick.playsOfTheDay, [
    { cbsEventId: 93, frozenAt: '2026-09-19T15:28:00.000Z' },
  ])

  const afterKick = freezeNamedPlays(
    [
      frozen({
        cbsEventId: 95,
        kickoff: saturdayNoon,
        category: 'lock',
        compositeEdge: 4,
      }),
      frozen({
        cbsEventId: 93,
        kickoff: saturdayNoon,
        category: 'slight',
        compositeEdge: 0.5,
      }),
    ],
    prekick,
    '2026-09-19T17:00:00.000Z',
    Date.parse('2026-09-19T13:00:00-04:00'),
  )
  assert.deepEqual(afterKick.playsOfTheDay, prekick.playsOfTheDay)

  const liveBeforeKick = resolveDayNamedPlay(
    [
      pick({
        gameId: 'uk',
        cbsEventId: 95,
        kickoff: saturdayNoon,
        homeAbbrev: 'UK',
        category: 'slight',
        compositeEdge: 1.25,
      }),
      pick({
        gameId: 'gt',
        cbsEventId: 93,
        kickoff: saturdayNoon,
        homeAbbrev: 'GATECH',
        category: 'lean',
        compositeEdge: 2.75,
      }),
    ],
    '2026-09-19',
    {
      playsOfTheDay: [{ cbsEventId: 95, frozenAt: '2026-09-19T12:05:00.000Z' }],
      now: Date.parse('2026-09-19T11:49:00-04:00'),
    },
    2,
  )
  assert.equal(liveBeforeKick?.pick.cbsEventId, 93)
})
