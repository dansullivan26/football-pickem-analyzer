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
  picks: number
  habits: Record<HabitKey, Habit>
}

export type PredictedGame = {
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  away: string
  home: string
  homeSpread: number
  predictedSide: 'home' | 'away' | null
  predictedTeam: string | null
  confidence: PredictionConfidence | null
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

type HabitCounts = {
  follows: number
  eligible: number
}

type Candidate = {
  label: string
  detail: string
  strength: number
}

const PRIOR_PICKS = 4
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
) {
  return history.weeks
    .filter((week) => week.scored && week.week < targetWeek)
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
) {
  const games = new Map<number, FrozenRecommendation>()
  for (const week of recommendations.weeks) {
    if (week.week >= maximumWeek) continue
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

function habitCandidate(
  habit: Habit,
  followLabel: string,
  fadeLabel: string,
): Candidate | null {
  if (!habit.active || !habit.preferred || habit.rate == null) return null
  const directionalRate =
    habit.preferred === 'follow' ? habit.rate : 1 - habit.rate
  return {
    label: habit.preferred === 'follow' ? followLabel : fadeLabel,
    detail: `${Math.round(directionalRate * 100)}% across ${habit.eligible} eligible picks`,
    strength: habit.strength * Math.min(1, habit.eligible / 20),
  }
}

export function buildPlayerPredictionProfile(
  entryId: string,
  targetWeek: number,
  history: PlayerHistory,
  recommendations: RecommendationHistory,
): PlayerPredictionProfile {
  const picks = playerPicksBefore(entryId, targetWeek, history)
  const recs = recommendationByEvent(recommendations, targetWeek)
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
      candidates.push({
        label: rate >= 0.5 ? 'Home-favorite taker' : 'Road-dog hunter',
        detail: `${Math.round(directionalRate * 100)}% across ${homeFavorite.eligible} home-favorite matchups`,
        strength:
          (directionalRate - 0.5) *
          2 *
          Math.min(1, homeFavorite.eligible / 20),
      })
    }
  }

  const strongest = candidates.sort((a, b) => b.strength - a.strength)[0]
  return {
    archetype: strongest?.label ?? 'No dominant pattern',
    archetypeDetail:
      strongest?.detail ??
      `${picks.length} prior picks, but no tendency is strong enough to label`,
    picks: picks.length,
    habits,
  }
}

function predictionConfidence(
  habit: Habit,
): PredictionConfidence {
  const directionalRate =
    habit.rate == null ? 0 : Math.max(habit.rate, 1 - habit.rate)
  if (habit.eligible >= 20 && directionalRate >= 0.75) return 'high'
  if (habit.eligible >= 12 || directionalRate >= 0.75) return 'medium'
  return 'low'
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
    | { habit: Habit; followsSide: 'home' | 'away'; reason: string }
    | null = null

  if (situational?.habit.active) {
    chosen = {
      ...situational,
      reason:
        situational.habit.key === 'line-value'
          ? 'Line-value habit'
          : 'Public-side habit',
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
      chosen = general[0]
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
    reason: chosen
      ? `${chosen.reason} · ${chosen.habit.eligible} prior chances`
      : profile.picks < 20
        ? 'Not enough prior picks'
        : 'Habits conflict or remain too close to 50/50',
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
  const profile = buildPlayerPredictionProfile(
    entryId,
    week.week,
    history,
    recommendations,
  )
  const actualPicks = new Map(
    (
      history.weeks
        .find((historyWeek) => historyWeek.week === week.week)
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
        .filter((historyWeek) => historyWeek.scored && historyWeek.week < week.week)
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
) {
  const reports = recommendations.weeks
    .filter((week) =>
      history.weeks.some(
        (historyWeek) => historyWeek.week === week.week && historyWeek.scored,
      ),
    )
    .map((week) =>
      predictPlayerWeek(entryId, week, history, recommendations),
    )
  const graded = reports.flatMap((report) =>
    report.games.filter((game) => game.correct != null),
  )
  const correct = graded.filter((game) => game.correct).length
  return {
    calls: graded.length,
    correct,
    accuracy: graded.length ? correct / graded.length : null,
  }
}
