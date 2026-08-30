import { sameSeasonWeek, weekIsBefore, weekSeason } from './careerHistory.ts'
import type {
  FrozenRecommendation,
  PlayerHistory,
  PlayerPick,
  RecommendationHistory,
  RecommendationWeek,
} from './types'

export type HabitKey = 'home' | 'favorite' | 'line-value' | 'public'
export type PredictionConfidence = 'low' | 'medium' | 'high'

export type Habit = {
  key: HabitKey
  label: string
  follows: number
  eligible: number
  rate: number | null
  preferred: 'follow' | 'fade' | null
  strength: number
  active: boolean
}

export type PlayerPredictionProfile = {
  archetype: string
  archetypeDetail: string
  /** Second-strongest leftover habit, when it is loud enough to mention. */
  insight: string | null
  picks: number
  habits: Record<HabitKey, Habit>
}

export const PREDICTION_STRATEGY_ID = 'v1-habits'

export type PredictedGame = {
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  away: string
  home: string
  homeSpread: number
  predictedSide: 'home' | 'away' | null
  predictedTeam: string | null
  confidence: PredictionConfidence | null
  /** 0–100 habit-strength meter. Null on a no-call. Absent on older frozen weeks. */
  meter?: number | null
  /** Why the meter sits where it does, including what held it down. */
  meterWhy?: string
  habitKey: HabitKey | null
  reason: string
  sampleSize: number
  actualSide: 'home' | 'away' | null
  correct: boolean | null
}

export type PlayerPrediction = {
  week: number
  label: string
  trainingThroughWeek: number | null
  profile: PlayerPredictionProfile
  games: PredictedGame[]
  calls: number
  graded: number
  correct: number
  accuracy: number | null
}

export type FrozenPlayerForecast = {
  entryId: string
  name: string
  archetype: string
  archetypeDetail: string
  priorPicks: number
  calls: number
  games: PredictedGame[]
}

export type PredictionForecastWeek = {
  week: number
  seasonYear?: number
  label: string
  strategyId: string
  capturedAt: string
  frozenAt: string | null
  trainingThroughWeek: number | null
  players: FrozenPlayerForecast[]
}

export type ResidualCell = {
  key: string
  games: number
  calls: number
  graded: number
  correct: number
  noCalls: number
  accuracy: number | null
  noCallRate: number | null
}

export type PredictionResidualReport = {
  strategyId: string
  updatedAt: string
  overall: ResidualCell
  byLeague: ResidualCell[]
  byMarket: ResidualCell[]
  byHabit: ResidualCell[]
  byConfidence: ResidualCell[]
}

export type PredictionForecasts = {
  updatedAt: string
  weeks: PredictionForecastWeek[]
  residuals: PredictionResidualReport | null
}

type HabitCounts = {
  follows: number
  eligible: number
}

type InsightKey = HabitKey | 'home-favorite'

type Candidate = {
  key: InsightKey
  label: string
  detail: string
  insight: string
  eligible: number
  directionalRate: number
  strength: number
}

const PRIOR_PICKS = 4
const INSIGHT_MIN_ELIGIBLE = 12
const INSIGHT_MIN_RATE = 0.7
const ACTIVE_RULES: Record<
  HabitKey,
  { minimum: number; minimumRate: number }
> = {
  home: { minimum: 20, minimumRate: 0.6 },
  favorite: { minimum: 20, minimumRate: 0.6 },
  'line-value': { minimum: 6, minimumRate: 2 / 3 },
  public: { minimum: 6, minimumRate: 2 / 3 },
}

function opposite(side: 'home' | 'away') {
  return side === 'home' ? ('away' as const) : ('home' as const)
}

function sideForFavorite(homeSpread: number) {
  if (homeSpread === 0) return null
  return homeSpread < 0 ? ('home' as const) : ('away' as const)
}

function playerPicksBefore(
  entryId: string,
  targetWeek: number,
  history: PlayerHistory,
  targetSeason = history.pool.seasonYear,
) {
  return history.weeks
    .filter(
      (week) =>
        week.scored &&
        weekIsBefore(
          week,
          targetWeek,
          targetSeason,
          history.pool.seasonYear,
        ),
    )
    .flatMap(
      (week) =>
        week.entries.find((entry) => entry.entryId === entryId)?.picks ?? [],
    )
    .filter(
      (pick): pick is PlayerPick & { pickedSide: 'home' | 'away' } =>
        pick.pickedSide === 'home' || pick.pickedSide === 'away',
    )
}

function recommendationByEvent(
  recommendations: RecommendationHistory,
  maximumWeek: number,
  targetSeason: number,
  fallbackSeason: number,
) {
  const games = new Map<number, FrozenRecommendation>()
  for (const week of recommendations.weeks) {
    if (!weekIsBefore(week, maximumWeek, targetSeason, fallbackSeason)) continue
    for (const game of week.games) games.set(game.cbsEventId, game)
  }
  return games
}

function makeHabit(
  key: HabitKey,
  label: string,
  counts: HabitCounts,
): Habit {
  if (!counts.eligible) {
    return {
      key,
      label,
      ...counts,
      rate: null,
      preferred: null,
      strength: 0,
      active: false,
    }
  }

  const rate = counts.follows / counts.eligible
  const preferred = rate >= 0.5 ? 'follow' : 'fade'
  const directionalRate = Math.max(rate, 1 - rate)
  const posteriorRate =
    (Math.max(counts.follows, counts.eligible - counts.follows) +
      PRIOR_PICKS / 2) /
    (counts.eligible + PRIOR_PICKS)
  const rule = ACTIVE_RULES[key]

  return {
    key,
    label,
    ...counts,
    rate,
    preferred,
    strength: Math.max(0, (posteriorRate - 0.5) * 2),
    active:
      counts.eligible >= rule.minimum && directionalRate >= rule.minimumRate,
  }
}

function insightSentence(
  key: InsightKey,
  preferred: 'follow' | 'fade',
  hits: number,
  eligible: number,
) {
  const of = `${hits} of ${eligible}`
  if (key === 'line-value') {
    return preferred === 'follow'
      ? `Has taken our line-value side on ${of} chances.`
      : `Has faded our line-value side on ${of} chances.`
  }
  if (key === 'public') {
    return preferred === 'follow'
      ? `Has taken the public side on ${of} chances.`
      : `Has faded the public side on ${of} chances.`
  }
  if (key === 'favorite') {
    return preferred === 'follow'
      ? `Has backed the favorite on ${of} chances.`
      : `Has hunted the dog on ${of} chances.`
  }
  if (key === 'home') {
    return preferred === 'follow'
      ? `Has taken the home team on ${of} chances.`
      : `Has taken the road team on ${of} chances.`
  }
  return preferred === 'follow'
    ? `Has taken home favorites on ${of} of those matchups.`
    : `Has taken the road dog on ${of} home-favorite matchups.`
}

function habitCandidate(
  habit: Habit,
  followLabel: string,
  fadeLabel: string,
): Candidate | null {
  if (!habit.active || !habit.preferred || habit.rate == null) return null
  const directionalRate =
    habit.preferred === 'follow' ? habit.rate : 1 - habit.rate
  const hits =
    habit.preferred === 'follow'
      ? habit.follows
      : habit.eligible - habit.follows
  return {
    key: habit.key,
    label: habit.preferred === 'follow' ? followLabel : fadeLabel,
    detail: `${Math.round(directionalRate * 100)}% across ${habit.eligible} eligible picks`,
    insight: insightSentence(habit.key, habit.preferred, hits, habit.eligible),
    eligible: habit.eligible,
    directionalRate,
    strength: habit.strength * Math.min(1, habit.eligible / 20),
  }
}

function redundantInsight(first: InsightKey, next: InsightKey) {
  if (first === next) return true
  const pair = new Set([first, next])
  return (
    pair.has('home-favorite') && (pair.has('home') || pair.has('favorite'))
  )
}

function profileInsight(ranked: Candidate[]) {
  const [first, ...rest] = ranked
  if (!first) return null
  for (const candidate of rest) {
    if (redundantInsight(first.key, candidate.key)) continue
    if (
      candidate.eligible < INSIGHT_MIN_ELIGIBLE ||
      candidate.directionalRate < INSIGHT_MIN_RATE
    ) {
      continue
    }
    return candidate.insight
  }
  return null
}

export function buildPlayerPredictionProfile(
  entryId: string,
  targetWeek: number,
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  targetSeason = history.pool.seasonYear,
): PlayerPredictionProfile {
  const picks = playerPicksBefore(entryId, targetWeek, history, targetSeason)
  const recs = recommendationByEvent(
    recommendations,
    targetWeek,
    targetSeason,
    history.pool.seasonYear,
  )
  const home: HabitCounts = { follows: 0, eligible: 0 }
  const favorite: HabitCounts = { follows: 0, eligible: 0 }
  const lineValue: HabitCounts = { follows: 0, eligible: 0 }
  const publicSide: HabitCounts = { follows: 0, eligible: 0 }
  const homeFavorite: HabitCounts = { follows: 0, eligible: 0 }

  for (const pick of picks) {
    home.eligible += 1
    if (pick.pickedSide === 'home') home.follows += 1

    const favoriteSide = sideForFavorite(pick.homeSpread)
    if (favoriteSide) {
      favorite.eligible += 1
      if (pick.pickedSide === favoriteSide) favorite.follows += 1
    }

    if (pick.homeSpread < 0) {
      homeFavorite.eligible += 1
      if (pick.pickedSide === 'home') homeFavorite.follows += 1
    }

    const rec = recs.get(pick.cbsEventId)
    if (rec?.source === 'line-value' && rec.recommendedSide) {
      lineValue.eligible += 1
      if (pick.pickedSide === rec.recommendedSide) lineValue.follows += 1
    }
    if (rec?.source === 'public-consensus' && rec.pickedSide) {
      publicSide.eligible += 1
      if (pick.pickedSide === rec.pickedSide) publicSide.follows += 1
    }
  }

  const habits = {
    home: makeHabit('home', 'Home teams', home),
    favorite: makeHabit('favorite', 'Favorites', favorite),
    'line-value': makeHabit('line-value', 'Line-value side', lineValue),
    public: makeHabit('public', 'Public side', publicSide),
  }

  if (picks.length < 20) {
    return {
      archetype: 'Building profile',
      archetypeDetail: `${picks.length} prior picks; 20 are needed before assigning a style`,
      insight: null,
      picks: picks.length,
      habits,
    }
  }

  const candidates = [
    habitCandidate(
      habits['line-value'],
      'Line-value follower',
      'Line-value contrarian',
    ),
    habitCandidate(habits.public, 'Public chalk taker', 'Public fader'),
    habitCandidate(habits.favorite, 'Favorite backer', 'Underdog hunter'),
    habitCandidate(habits.home, 'Home-team lean', 'Road-team lean'),
  ].filter((candidate): candidate is Candidate => candidate != null)

  if (homeFavorite.eligible >= 10) {
    const rate = homeFavorite.follows / homeFavorite.eligible
    const directionalRate = Math.max(rate, 1 - rate)
    if (directionalRate >= 0.65) {
      const preferred = rate >= 0.5 ? 'follow' : 'fade'
      const hits =
        preferred === 'follow'
          ? homeFavorite.follows
          : homeFavorite.eligible - homeFavorite.follows
      candidates.push({
        key: 'home-favorite',
        label: preferred === 'follow' ? 'Home-favorite taker' : 'Road-dog hunter',
        detail: `${Math.round(directionalRate * 100)}% across ${homeFavorite.eligible} home-favorite matchups`,
        insight: insightSentence(
          'home-favorite',
          preferred,
          hits,
          homeFavorite.eligible,
        ),
        eligible: homeFavorite.eligible,
        directionalRate,
        strength:
          (directionalRate - 0.5) *
          2 *
          Math.min(1, homeFavorite.eligible / 20),
      })
    }
  }

  const ranked = [...candidates].sort((left, right) => {
    if (right.strength !== left.strength) return right.strength - left.strength
    return left.key.localeCompare(right.key)
  })
  const strongest = ranked[0]
  return {
    archetype: strongest?.label ?? 'No dominant pattern',
    archetypeDetail:
      strongest?.detail ??
      `${picks.length} prior picks, but no tendency is strong enough to label`,
    insight: profileInsight(ranked),
    picks: picks.length,
    habits,
  }
}

function habitDirectionalRate(habit: Habit) {
  return habit.rate == null ? 0 : Math.max(habit.rate, 1 - habit.rate)
}

function predictionConfidence(
  habit: Habit,
): PredictionConfidence {
  const directionalRate = habitDirectionalRate(habit)
  if (habit.eligible >= 20 && directionalRate >= 0.75) return 'high'
  if (habit.eligible >= 12 || directionalRate >= 0.75) return 'medium'
  return 'low'
}

function predictionMeter(
  habit: Habit,
  agreed: boolean,
): { meter: number; meterWhy: string } {
  const directionalRate = habitDirectionalRate(habit)
  const ratePct = Math.round(directionalRate * 100)
  let meter = Math.round(habit.strength * 100)
  if (agreed) meter = Math.min(100, meter + 8)
  const verb = habit.preferred === 'fade' ? 'fade' : 'take'
  const parts = [
    `${ratePct}% ${verb} over ${habit.eligible} prior chances.`,
  ]
  if (agreed) parts.push('A second habit points the same way.')
  if (habit.eligible < 20) {
    parts.push(
      `Sample is still thin (${habit.eligible} < 20), so the bar stays conservative.`,
    )
  } else if (directionalRate < 0.75) {
    parts.push(`The lean is ${ratePct}%, not a 75% lock.`)
  }
  return { meter, meterWhy: parts.join(' ') }
}

function predictedSideFromHabit(
  habit: Habit,
  followsSide: 'home' | 'away',
) {
  return habit.preferred === 'fade' ? opposite(followsSide) : followsSide
}

function predictGame(
  game: FrozenRecommendation,
  profile: PlayerPredictionProfile,
  actualSide: 'home' | 'away' | null,
): PredictedGame {
  const situational =
    game.source === 'line-value' && game.recommendedSide
      ? {
          habit: profile.habits['line-value'],
          followsSide: game.recommendedSide,
        }
      : game.source === 'public-consensus' && game.pickedSide
        ? { habit: profile.habits.public, followsSide: game.pickedSide }
        : null

  let chosen:
    | {
        habit: Habit
        followsSide: 'home' | 'away'
        reason: string
        agreed: boolean
      }
    | null = null

  if (situational?.habit.active) {
    chosen = {
      ...situational,
      reason:
        situational.habit.key === 'line-value'
          ? 'Line-value habit'
          : 'Public-side habit',
      agreed: false,
    }
  } else {
    const general = [
      profile.habits.home.active
        ? {
            habit: profile.habits.home,
            followsSide: 'home' as const,
            reason: 'Home/road habit',
          }
        : null,
      profile.habits.favorite.active && sideForFavorite(game.homeSpread)
        ? {
            habit: profile.habits.favorite,
            followsSide: sideForFavorite(game.homeSpread) as 'home' | 'away',
            reason: 'Favorite/dog habit',
          }
        : null,
    ]
      .filter((candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate),
      )
      .sort((a, b) => b.habit.strength - a.habit.strength)

    if (general.length === 1) {
      chosen = { ...general[0], agreed: false }
    } else if (general.length === 2) {
      const firstSide = predictedSideFromHabit(
        general[0].habit,
        general[0].followsSide,
      )
      const secondSide = predictedSideFromHabit(
        general[1].habit,
        general[1].followsSide,
      )
      if (
        firstSide === secondSide ||
        general[0].habit.strength - general[1].habit.strength >= 0.08
      ) {
        chosen = {
          ...general[0],
          agreed: firstSide === secondSide,
          reason:
            firstSide === secondSide
              ? `${general[0].reason} + ${general[1].reason.toLowerCase()}`
              : general[0].reason,
        }
      }
    }
  }

  const predictedSide = chosen
    ? predictedSideFromHabit(chosen.habit, chosen.followsSide)
    : null
  const noCallWhy =
    profile.picks < 20
      ? 'Not enough prior picks'
      : 'Habits conflict or remain too close to 50/50'
  const scored = chosen ? predictionMeter(chosen.habit, chosen.agreed) : null
  return {
    cbsEventId: game.cbsEventId,
    sport: game.sport,
    away: game.away,
    home: game.home,
    homeSpread: game.homeSpread,
    predictedSide,
    predictedTeam:
      predictedSide === 'home'
        ? game.home
        : predictedSide === 'away'
          ? game.away
          : null,
    confidence: chosen ? predictionConfidence(chosen.habit) : null,
    meter: scored?.meter ?? null,
    meterWhy:
      scored && chosen
        ? `${chosen.reason}. ${scored.meterWhy}`
        : noCallWhy,
    habitKey: chosen?.habit.key ?? null,
    reason: chosen
      ? `${chosen.reason} · ${chosen.habit.eligible} prior chances`
      : noCallWhy,
    sampleSize: chosen?.habit.eligible ?? 0,
    actualSide,
    correct:
      predictedSide && actualSide ? predictedSide === actualSide : null,
  }
}

export function predictPlayerWeek(
  entryId: string,
  week: RecommendationWeek,
  history: PlayerHistory,
  recommendations: RecommendationHistory,
): PlayerPrediction {
  const targetSeason = weekSeason(week, history.pool.seasonYear)
  const profile = buildPlayerPredictionProfile(
    entryId,
    week.week,
    history,
    recommendations,
    targetSeason,
  )
  const actualPicks = new Map(
    (
      history.weeks
        .find((historyWeek) =>
          sameSeasonWeek(historyWeek, week, history.pool.seasonYear),
        )
        ?.entries.find((entry) => entry.entryId === entryId)?.picks ?? []
    )
      .filter(
        (pick): pick is PlayerPick & { pickedSide: 'home' | 'away' } =>
          pick.matchStatus === 'matched' &&
          (pick.pickedSide === 'home' || pick.pickedSide === 'away'),
      )
      .map((pick) => [pick.cbsEventId, pick.pickedSide]),
  )
  const games = week.games.map((game) =>
    predictGame(
      game,
      profile,
      actualPicks.get(game.cbsEventId) ?? null,
    ),
  )
  const graded = games.filter((game) => game.correct != null)
  const correct = graded.filter((game) => game.correct).length

  return {
    week: week.week,
    label: week.label,
    trainingThroughWeek:
      history.weeks
        .filter(
          (historyWeek) =>
            historyWeek.scored &&
            weekIsBefore(
              historyWeek,
              week.week,
              targetSeason,
              history.pool.seasonYear,
            ),
        )
        .at(-1)?.week ?? null,
    profile,
    games,
    calls: games.filter((game) => game.predictedSide).length,
    graded: graded.length,
    correct,
    accuracy: graded.length ? correct / graded.length : null,
  }
}

export function predictionSeasonRecord(
  entryId: string,
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  forecasts?: PredictionForecasts | null,
) {
  const frozen = forecasts?.weeks
    .filter(
      (week) =>
        week.strategyId === PREDICTION_STRATEGY_ID && week.frozenAt,
    )
    .flatMap(
      (week) =>
        week.players.find((player) => player.entryId === entryId)?.games ?? [],
    )
    .filter((game) => game.correct != null)
  const graded =
    frozen && frozen.length > 0
      ? frozen
          : recommendations.weeks
          .filter((week) =>
            history.weeks.some(
              (historyWeek) =>
                sameSeasonWeek(historyWeek, week, history.pool.seasonYear) &&
                historyWeek.scored,
            ),
          )
          .flatMap(
            (week) =>
              predictPlayerWeek(entryId, week, history, recommendations).games,
          )
          .filter((game) => game.correct != null)
  const correct = graded.filter((game) => game.correct).length
  return {
    calls: graded.length,
    correct,
    accuracy: graded.length ? correct / graded.length : null,
  }
}

function matchedActualSide(
  entryId: string,
  week: number,
  cbsEventId: number,
  history: PlayerHistory,
) {
  const pick = history.weeks
    .find((historyWeek) => historyWeek.week === week)
    ?.entries.find((entry) => entry.entryId === entryId)
    ?.picks.find((row) => row.cbsEventId === cbsEventId)
  if (
    pick?.matchStatus !== 'matched' ||
    (pick.pickedSide !== 'home' && pick.pickedSide !== 'away')
  ) {
    return null
  }
  return pick.pickedSide
}

function gradeForecastGames(
  entryId: string,
  week: number,
  games: PredictedGame[],
  history: PlayerHistory,
) {
  return games.map((game) => {
    const actualSide = matchedActualSide(
      entryId,
      week,
      game.cbsEventId,
      history,
    )
    return {
      ...game,
      actualSide,
      correct:
        game.predictedSide && actualSide
          ? game.predictedSide === actualSide
          : null,
    }
  })
}

function residualCell(key: string, games: PredictedGame[]): ResidualCell {
  const calls = games.filter((game) => game.predictedSide).length
  const graded = games.filter((game) => game.correct != null)
  const correct = graded.filter((game) => game.correct).length
  return {
    key,
    games: games.length,
    calls,
    graded: graded.length,
    correct,
    noCalls: games.length - calls,
    accuracy: graded.length ? correct / graded.length : null,
    noCallRate: games.length ? (games.length - calls) / games.length : null,
  }
}

function marketKey(game: PredictedGame) {
  if (!game.predictedSide) return 'no-call'
  const favoriteSide = sideForFavorite(game.homeSpread)
  if (!favoriteSide) return 'pickem'
  return game.predictedSide === favoriteSide ? 'favorite' : 'dog'
}

export function summarizePredictionResiduals(
  weeks: PredictionForecastWeek[],
  capturedAt: string,
): PredictionResidualReport | null {
  const games = weeks
    .filter((week) => week.strategyId === PREDICTION_STRATEGY_ID)
    .flatMap((week) => week.players.flatMap((player) => player.games))
  if (games.length === 0) return null

  const by = (keyFor: (game: PredictedGame) => string) => {
    const buckets = new Map<string, PredictedGame[]>()
    for (const game of games) {
      const key = keyFor(game)
      const rows = buckets.get(key) ?? []
      rows.push(game)
      buckets.set(key, rows)
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => residualCell(key, rows))
  }

  return {
    strategyId: PREDICTION_STRATEGY_ID,
    updatedAt: capturedAt,
    overall: residualCell('overall', games),
    byLeague: by((game) => game.sport),
    byMarket: by(marketKey),
    byHabit: by((game) => game.habitKey ?? 'no-call'),
    byConfidence: by((game) => game.confidence ?? 'no-call'),
  }
}

export function snapshotPlayerForecasts(
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  previous: PredictionForecasts | null,
  now = Date.now(),
): PredictionForecasts {
  const capturedAt = new Date(now).toISOString()
  const seasonKey = (
    week: { week: number; seasonYear?: number },
    fallback = history.pool.seasonYear,
  ) => `${weekSeason(week, fallback)}:${week.week}`
  const previousByWeek = new Map(
    (previous?.weeks ?? [])
      .filter((week) => week.strategyId === PREDICTION_STRATEGY_ID)
      .map((week) => [seasonKey(week), week]),
  )
  const otherWeeks = (previous?.weeks ?? []).filter(
    (week) => week.strategyId !== PREDICTION_STRATEGY_ID,
  )

  const weeks = recommendations.weeks.map((recWeek) => {
    const existing = previousByWeek.get(seasonKey(recWeek))
    const playerWeek = history.weeks.find((week) =>
      sameSeasonWeek(week, recWeek, history.pool.seasonYear),
    )
    const firstKickoff = recWeek.games
      .map((game) => new Date(game.kickoff).getTime())
      .sort((a, b) => a - b)[0]
    const shouldFreeze =
      playerWeek?.scored === true ||
      (typeof firstKickoff === 'number' && firstKickoff <= now)

    if (existing?.frozenAt) {
      return {
        ...existing,
        players: existing.players.map((player) => {
          const games = gradeForecastGames(
            player.entryId,
            recWeek.week,
            player.games,
            history,
          )
          return {
            ...player,
            games,
            calls: games.filter((game) => game.predictedSide).length,
          }
        }),
      }
    }

    const players = history.entries.map((entry) => {
      const report = predictPlayerWeek(
        entry.entryId,
        recWeek,
        history,
        recommendations,
      )
      return {
        entryId: entry.entryId,
        name: entry.name,
        archetype: report.profile.archetype,
        archetypeDetail: report.profile.archetypeDetail,
        priorPicks: report.profile.picks,
        calls: report.calls,
        games: report.games,
      }
    })

    return {
      week: recWeek.week,
      seasonYear: weekSeason(recWeek, history.pool.seasonYear),
      label: recWeek.label,
      strategyId: PREDICTION_STRATEGY_ID,
      capturedAt,
      frozenAt: shouldFreeze ? capturedAt : null,
      trainingThroughWeek:
        history.weeks
          .filter((historyWeek) =>
            historyWeek.scored &&
            weekIsBefore(
              historyWeek,
              recWeek.week,
              weekSeason(recWeek, history.pool.seasonYear),
              history.pool.seasonYear,
            ),
          )
          .at(-1)?.week ?? null,
      players,
    }
  })

  const nextWeeks = [...otherWeeks, ...weeks].sort(
    (left, right) =>
      weekSeason(left, history.pool.seasonYear) -
        weekSeason(right, history.pool.seasonYear) || left.week - right.week,
  )
  return {
    updatedAt: capturedAt,
    weeks: nextWeeks,
    residuals: summarizePredictionResiduals(nextWeeks, capturedAt),
  }
}

export function frozenPlayerWeek(
  forecasts: PredictionForecasts | null | undefined,
  entryId: string,
  week: number,
) {
  return forecasts?.weeks
    .find(
      (row) =>
        row.week === week && row.strategyId === PREDICTION_STRATEGY_ID,
    )
    ?.players.find((player) => player.entryId === entryId)
}
