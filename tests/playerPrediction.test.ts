import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPlayerPredictionProfile,
  predictPlayerWeek,
  snapshotPlayerForecasts,
} from '../src/playerPrediction.ts'
import type {
  FrozenRecommendation,
  PlayerHistory,
  PlayerPick,
  PlayerWeek,
  RecommendationHistory,
  RecommendationWeek,
} from '../src/types.ts'

const entryId = 'player-1'

function pick(
  cbsEventId: number,
  pickedSide: 'home' | 'away',
  homeSpread = 3,
): PlayerPick {
  return {
    gameId: `game-${cbsEventId}`,
    cbsEventId,
    sport: 'NCAAF',
    away: `AWAY${cbsEventId}`,
    home: `HOME${cbsEventId}`,
    homeSpread,
    pickedTeamId: pickedSide,
    pickedTeam: pickedSide === 'home' ? `HOME${cbsEventId}` : `AWAY${cbsEventId}`,
    pickedSide,
    result: 'win',
    points: 1,
    pickStatus: 'CORRECT',
    matchStatus: 'matched',
  }
}

function historyWeek(
  week: number,
  picks: PlayerPick[],
  scored = true,
): PlayerWeek {
  return {
    week,
    periodId: `period-${week}`,
    label: `Week ${week}`,
    status: scored ? 'scored' : 'in_progress',
    scored,
    slateFile: `week-${week}.json`,
    entries: [
      {
        entryId,
        name: 'Player One',
        weekScore: scored ? picks.length : null,
        weekRank: null,
        correctPicks: scored ? picks.length : null,
        picksCount: picks.length,
        tiebreaker: { question: null, answer: null },
        picks,
      },
    ],
  }
}

function history(weeks: PlayerWeek[]): PlayerHistory {
  return {
    source: { fetchedAt: '2026-09-01T12:00:00Z', timezone: 'America/New_York' },
    pool: { name: 'Test Pool', seasonYear: 2026 },
    entries: [
      {
        entryId,
        name: 'Player One',
        hasMadeAPick: true,
        season: {
          score: null,
          rank: null,
          correctPicks: null,
          picksMadeCount: null,
        },
      },
    ],
    weeks,
  }
}

function recGame(
  cbsEventId: number,
  options: Partial<FrozenRecommendation> = {},
): FrozenRecommendation {
  return {
    cbsEventId,
    sport: 'NCAAF',
    kickoff: '2026-09-05T12:00:00-04:00',
    away: `AWAY${cbsEventId}`,
    home: `HOME${cbsEventId}`,
    homeSpread: 3,
    liveHomeSpread: 3,
    category: 'neutral',
    recommendedSide: null,
    hook: null,
    cover: null,
    source: null,
    pickedSide: null,
    strength: null,
    score: null,
    ...options,
  }
}

function recWeek(
  week: number,
  games: FrozenRecommendation[],
  scored = false,
): RecommendationWeek {
  return {
    week,
    label: `Week ${week}`,
    capturedAt: '2026-09-01T12:00:00Z',
    scored,
    games,
  }
}

function recHistory(weeks: RecommendationWeek[]): RecommendationHistory {
  return { updatedAt: '2026-09-01T12:00:00Z', weeks }
}

test('withholds calls before a player has enough history', () => {
  const target = recWeek(1, [recGame(100)])
  const report = predictPlayerWeek(
    entryId,
    target,
    history([historyWeek(1, [pick(100, 'home')], false)]),
    recHistory([target]),
  )

  assert.equal(report.profile.archetype, 'Building profile')
  assert.equal(report.profile.insight, null)
  assert.equal(report.calls, 0)
  assert.equal(report.games[0].reason, 'Not enough prior picks')
  assert.equal(report.games[0].meter, null)
  assert.equal(report.games[0].meterWhy, 'Not enough prior picks')
})

test('uses only prior weeks and grades the later actual pick automatically', () => {
  const priorPicks = Array.from({ length: 20 }, (_, index) =>
    pick(index + 1, index < 16 ? 'home' : 'away'),
  )
  const targetGame = recGame(100, { homeSpread: 2.5 })
  const target = recWeek(2, [targetGame], true)
  const playerHistory = history([
    historyWeek(1, priorPicks),
    historyWeek(2, [pick(100, 'away', 2.5)]),
  ])
  const recommendations = recHistory([recWeek(1, []), target])
  const report = predictPlayerWeek(
    entryId,
    target,
    playerHistory,
    recommendations,
  )

  assert.equal(report.trainingThroughWeek, 1)
  assert.equal(report.games[0].predictedSide, 'home')
  assert.equal(report.games[0].actualSide, 'away')
  assert.equal(report.games[0].correct, false)
  assert.equal(report.accuracy, 0)
  assert.equal(report.games[0].confidence, 'high')
  assert.ok((report.games[0].meter ?? 0) >= 50)
  assert.match(report.games[0].meterWhy ?? '', /Home\/road/)
})

test('a decisive small line-value sample can make an early call', () => {
  const priorPicks = Array.from({ length: 6 }, (_, index) =>
    pick(index + 1, index % 2 === 0 ? 'home' : 'away'),
  )
  const priorGames = priorPicks.map((playerPick) =>
    recGame(playerPick.cbsEventId, {
      category: 'lean',
      source: 'line-value',
      recommendedSide: playerPick.pickedSide,
      pickedSide: playerPick.pickedSide,
    }),
  )
  const target = recWeek(2, [
    recGame(100, {
      category: 'lean',
      source: 'line-value',
      recommendedSide: 'away',
      pickedSide: 'away',
    }),
  ])
  const playerHistory = history([
    historyWeek(1, priorPicks),
    historyWeek(2, [], false),
  ])
  const recommendations = recHistory([recWeek(1, priorGames, true), target])
  const profile = buildPlayerPredictionProfile(
    entryId,
    2,
    playerHistory,
    recommendations,
  )
  const report = predictPlayerWeek(
    entryId,
    target,
    playerHistory,
    recommendations,
  )

  assert.equal(profile.habits['line-value'].active, true)
  assert.equal(report.games[0].predictedSide, 'away')
  assert.match(report.games[0].reason, /Line-value habit/)
  assert.ok((report.games[0].meter ?? 0) > 0)
  assert.match(report.games[0].meterWhy ?? '', /thin/)
})

test('assigns a supported home-favorite archetype on the fly', () => {
  const priorPicks = Array.from({ length: 20 }, (_, index) =>
    pick(index + 1, 'home', -3.5),
  )
  const profile = buildPlayerPredictionProfile(
    entryId,
    2,
    history([historyWeek(1, priorPicks)]),
    recHistory([recWeek(1, [])]),
  )

  assert.equal(profile.archetype, 'Home-favorite taker')
  assert.match(profile.archetypeDetail, /20 home-favorite matchups/)
  assert.equal(profile.insight, null)
})

test('adds a second-habit sentence when it is loud and not a restatement', () => {
  const priorPicks = Array.from({ length: 20 }, (_, index) =>
    pick(index + 1, 'home', index < 8 ? -3.5 : 3.5),
  )
  const lineValueGames = priorPicks.slice(0, 12).map((playerPick) =>
    recGame(playerPick.cbsEventId, {
      homeSpread: playerPick.homeSpread,
      category: 'lean',
      source: 'line-value',
      recommendedSide: playerPick.pickedSide,
      pickedSide: playerPick.pickedSide,
    }),
  )
  const profile = buildPlayerPredictionProfile(
    entryId,
    2,
    history([historyWeek(1, priorPicks)]),
    recHistory([recWeek(1, lineValueGames)]),
  )

  assert.equal(profile.archetype, 'Home-team lean')
  assert.equal(
    profile.insight,
    'Has taken our line-value side on 12 of 12 chances.',
  )
})

test('excludes ambiguous actual picks from prediction accuracy', () => {
  const priorPicks = Array.from({ length: 20 }, (_, index) =>
    pick(index + 1, 'home'),
  )
  const ambiguous = {
    ...pick(100, 'away'),
    matchStatus: 'ambiguous' as const,
  }
  const target = recWeek(2, [recGame(100)], true)
  const report = predictPlayerWeek(
    entryId,
    target,
    history([
      historyWeek(1, priorPicks),
      historyWeek(2, [ambiguous]),
    ]),
    recHistory([recWeek(1, []), target]),
  )

  assert.equal(report.calls, 1)
  assert.equal(report.graded, 0)
  assert.equal(report.accuracy, null)
})

test('freezes predicted sides after kickoff and grades without rewriting them', () => {
  const priorPicks = Array.from({ length: 20 }, (_, index) =>
    pick(index + 1, 'home'),
  )
  const weekTwo = recWeek(2, [recGame(100, { homeSpread: 3 })], true)
  const recs = recHistory([recWeek(1, []), weekTwo])
  const openHistory = history([
    historyWeek(1, priorPicks),
    historyWeek(2, [], false),
  ])
  const frozen = snapshotPlayerForecasts(
    openHistory,
    recs,
    null,
    Date.parse('2026-09-06T16:00:00-04:00'),
  )
  const week = frozen.weeks.find((row) => row.week === 2)
  assert.ok(week?.frozenAt)
  assert.equal(week?.players[0].games[0].predictedSide, 'home')
  assert.equal(week?.players[0].games[0].habitKey, 'home')

  const scored = snapshotPlayerForecasts(
    history([
      historyWeek(1, priorPicks),
      historyWeek(2, [pick(100, 'away', 3)]),
    ]),
    recs,
    frozen,
    Date.parse('2026-09-10T12:00:00-04:00'),
  )
  const graded = scored.weeks.find((row) => row.week === 2)?.players[0].games[0]
  assert.equal(graded?.predictedSide, 'home')
  assert.equal(graded?.actualSide, 'away')
  assert.equal(graded?.correct, false)
  assert.equal(scored.residuals?.overall.graded, 1)
  assert.equal(
    scored.residuals?.byMarket.find((cell) => cell.key === 'dog')?.correct,
    0,
  )
})

test('prior-season scored picks count toward the next Year Week 1 profile', () => {
  const prior = historyWeek(
    1,
    Array.from({ length: 20 }, (_, index) => pick(index + 1, 'home', -3)),
  )
  prior.seasonYear = 2025
  const current = historyWeek(1, [], false)
  current.seasonYear = 2026
  const profile = buildPlayerPredictionProfile(
    entryId,
    1,
    history([prior, current]),
    { updatedAt: '', weeks: [] },
    2026,
  )
  assert.equal(profile.picks, 20)
  assert.notEqual(profile.archetype, 'Building profile')
})
