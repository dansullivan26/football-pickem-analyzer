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
  dayPlayReady,
  firstCardKickoff,
  formatNamedPlayAsOf,
  freezeNamedPlays,
  namedPlayGames,
  namedPlayKindForGame,
  namedPlayFreezeAt,
  resolveWeekNamedPlay,
  topFrozenNamedPlay,
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
    'Saturday:\n\nUNC +3.5 (light)\n\nSunday:\n\nKC +5.5 (strong)',
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
    'Play of the week (as of Sat 8:00 AM ET): UNC +3.5 (light)\n\nSaturday:\n\nUNC +3.5 (light — play of the week)\n\nSunday:\n\nKC +5.5 (strong)',
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
    'Play of the day (as of Sat 8:00 AM ET): UNC +3.5 (light)\n\nUNC +3.5 (light — play of the day)',
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
  assert.deepEqual(satAm.playsOfTheDay, [
    { cbsEventId: 11, frozenAt: '2026-09-19T12:05:00.000Z' },
  ])

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
  assert.equal(later.playsOfTheDay[0]?.cbsEventId, 11)
  assert.equal(later.playsOfTheDay[1]?.cbsEventId, 33)
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
    ],
    games: [
      frozen({
        cbsEventId: 11,
        kickoff: saturdayNoon,
        pickedSide: 'away',
        cover: 'away',
      }),
      frozen({
        cbsEventId: 22,
        kickoff: sundayOne,
        pickedSide: 'away',
        cover: 'home',
      }),
    ],
  }

  assert.equal(namedPlayKindForGame(week, 11), 'week')
  assert.equal(namedPlayKindForGame(week, 22), 'day')
  assert.equal(namedPlayGames([week], 'week').length, 1)
  assert.equal(namedPlayGames([week], 'day').length, 2)
  assert.equal(topFrozenNamedPlay(week.games)?.cbsEventId, 11)
})
