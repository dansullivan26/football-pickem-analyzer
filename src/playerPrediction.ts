import {
  sameSeasonWeek,
  weekIsBefore,
  weekIsGraded,
  weekSeason,
} from './careerHistory.ts'
import type { LastKickoffFile } from './lastKickoff.ts'
import { recIsNeutralSite } from './teamSite.ts'
import {
  appearancePair,
  buildTravelRestIndex,
  shorterRestSide,
  travelingSide,
  type AppearanceTravelRest,
} from './travelRest.ts'
import type {
  FrozenRecommendation,
  PlayerHistory,
  PlayerPick,
  PlayerWeek,
  RecommendationHistory,
  RecommendationWeek,
  Slate,
} from './types'

export type HabitKey =
  | 'home'
  | 'favorite'
  | 'line-value'
  | 'public'
  | 'travel'
  | 'rest'
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

/** Habit axes plus the home-favorite cross, which is not a standalone habit. */
export type ProfileSignalKey = HabitKey | 'home-favorite'

/** One tendency that cleared its bar, ranked against the others. */
export type ProfileSignal = {
  key: ProfileSignalKey
  label: string
  detail: string
  sentence: string
  hits: number
  eligible: number
  /** Share on the preferred pole, so always 0.5 or better. */
  rate: number
  /** Active enough to drive a call, but too small to lean on yet. */
  thin: boolean
}

export type PlayerPredictionProfile = {
  archetype: string
  archetypeDetail: string
  /** Every active tendency, strongest first. The first is the archetype. */
  signals: ProfileSignal[]
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

/**
 * The meter and the confidence tier answer different questions, so they are
 * labeled separately: the meter is how far the habit sits from a coin flip
 * after shrinking, the tier is how much evidence stands behind it.
 */
export function leanLabel(meter: number) {
  if (meter >= 70) return 'Strong lean'
  if (meter >= 40) return 'Clear lean'
  if (meter >= 20) return 'Mild lean'
  return 'Slight lean'
}

export const EVIDENCE_LABELS: Record<PredictionConfidence, string> = {
  high: 'Deep sample',
  medium: 'Fair sample',
  low: 'Thin sample',
}

export const EVIDENCE_RULES: Record<PredictionConfidence, string> = {
  high: '20+ prior chances and at least 75% on the preferred side.',
  medium: '12+ prior chances, or at least 75% on a smaller sample.',
  low: 'Under 12 prior chances and under 75%.',
}

export type ResidualGroup =
  | 'overall'
  | 'league'
  | 'market'
  | 'habit'
  | 'confidence'

/**
 * Bucket keys are stored raw so the frozen file stays stable. `favorite` means
 * different things in the market and habit groups, and `no-call` repeats in
 * three groups, so labels have to be resolved per group.
 */
const RESIDUAL_LABELS: Record<ResidualGroup, Record<string, string>> = {
  overall: { overall: 'Every locked call' },
  league: { NFL: 'NFL', NCAAF: 'College' },
  market: {
    favorite: 'Called the favorite',
    dog: 'Called the underdog',
    pickem: 'Pick’em game',
    'no-call': 'No call made',
  },
  habit: {
    home: 'Home/road habit',
    favorite: 'Favorite/dog habit',
    'line-value': 'Line-value habit',
    public: 'Public-side habit',
    travel: 'Travel habit',
    rest: 'Rest habit',
    'no-call': 'No call made',
  },
  confidence: { ...EVIDENCE_LABELS, 'no-call': 'No call made' },
}

export function residualLabel(group: ResidualGroup, key: string) {
  return RESIDUAL_LABELS[group][key] ?? key
}

function residualSliceSubject(group: ResidualGroup, cell: ResidualCell) {
  const label = residualLabel(group, cell.key)
  if (group === 'overall') return 'player-games'
  if (group === 'league') {
    if (cell.key === 'NFL') return 'NFL player-games'
    if (cell.key === 'NCAAF') return 'college player-games'
    return `${label} player-games`
  }
  if (cell.key === 'no-call') return 'player-games'
  if (group === 'market') {
    if (cell.key === 'favorite') return 'player-games where we called the favorite'
    if (cell.key === 'dog') return 'player-games where we called the underdog'
    if (cell.key === 'pickem') return 'player-games that were pick’ems'
    return `player-games labeled ${label}`
  }
  if (group === 'habit') {
    return `player-games whose guess was driven by the ${label.toLowerCase()}`
  }
  return `player-games backed by a ${label.toLowerCase()}`
}

/**
 * Sentence-form reading of a scorecard tile. Counts are player-games (one
 * player on one slate game), not unique matchups. “Right” means we named the
 * side they picked, not whether that pick covered.
 */
export function residualSliceCopy(group: ResidualGroup, cell: ResidualCell) {
  const noCallPct = Math.round((cell.noCallRate ?? 0) * 100)
  const subject = residualSliceSubject(group, cell)
  const habitNote =
    group === 'habit' && cell.key !== 'no-call'
      ? ' This tile is only that one tendency, not every picker habit.'
      : ''

  if (cell.key === 'no-call') {
    return {
      line: `${cell.games} player-games with no guess`,
      title: `The model declined to guess on ${cell.games} player-games in this slice. A player-game is one person on one slate game, not a unique matchup.`,
    }
  }

  if (!cell.graded) {
    return {
      line: `${cell.calls} calls · none graded yet · ${noCallPct}% no call`,
      title: `We named a side on ${cell.calls} of ${cell.games} ${subject}. None are graded yet — grading starts once that player submits a pick. Ungraded calls still count as guesses.${habitNote}`,
    }
  }

  const pct = Math.round((cell.accuracy ?? 0) * 100)
  return {
    line: `${cell.correct} of ${cell.graded} graded player-games · ${cell.calls} calls · ${noCallPct}% no call`,
    title: `Of the ${subject} that already have a submitted pick to check, we named the side they picked ${cell.correct} of ${cell.graded} times (${pct}%). We made ${cell.calls} calls in this slice; ${cell.graded} is only that graded subset, not unique matchups. Right means we read their pick, not whether it covered.${habitNote}`,
  }
}

export type PredictionForecasts = {
  updatedAt: string
  weeks: PredictionForecastWeek[]
  residuals: PredictionResidualReport | null
}

export type PredictionMaturityKey =
  | 'early'
  | 'developing'
  | 'established'
  | 'deeper'

export type PredictionMaturity = {
  key: PredictionMaturityKey
  label: string
  detail: string
  completedWeeks: number
  gradedCalls: number
}

const MATURITY_STAGES: Array<{
  key: PredictionMaturityKey
  label: string
  weeks: number
  calls: number
  detail: string
}> = [
  {
    key: 'early',
    label: 'Very early read',
    weeks: 0,
    calls: 0,
    detail:
      'Treat this as directional only. It may be beating a coin flip so far, but too little is settled to trust the exact percentage.',
  },
  {
    key: 'developing',
    label: 'Developing sample',
    weeks: 2,
    calls: 100,
    detail:
      'There is enough settled history to compare broad results with a coin flip, but exact percentages and narrow slices can still swing sharply.',
  },
  {
    key: 'established',
    label: 'More established',
    weeks: 4,
    calls: 300,
    detail:
      'Several complete forecast weeks support the broad patterns. League, habit, and player-specific slices may still be thin.',
  },
  {
    key: 'deeper',
    label: 'Deeper in-season sample',
    weeks: 6,
    calls: 500,
    detail:
      'Broad rates should be more stable than the early-season read. They remain descriptive evidence, never a guarantee.',
  },
]

export const PREDICTION_MATURITY_MILESTONES = MATURITY_STAGES.map(
  ({ key, label, weeks, calls }) => ({ key, label, weeks, calls }),
)

export function predictionMaturity(
  completedWeeks: number,
  gradedCalls: number,
): PredictionMaturity {
  const stage =
    [...MATURITY_STAGES]
      .reverse()
      .find(
        (candidate) =>
          completedWeeks >= candidate.weeks && gradedCalls >= candidate.calls,
      ) ?? MATURITY_STAGES[0]!
  return {
    key: stage.key,
    label: stage.label,
    detail: stage.detail,
    completedWeeks,
    gradedCalls,
  }
}

export function completedForecastWeekCount(
  forecastWeeks: PredictionForecastWeek[],
  historyWeeks: PlayerWeek[],
  fallbackSeason: number,
) {
  return forecastWeeks.filter(
    (forecast) =>
      forecast.strategyId === PREDICTION_STRATEGY_ID &&
      forecast.frozenAt &&
      forecast.players.some((player) => player.calls > 0) &&
      historyWeeks.some(
        (week) =>
          week.scored && sameSeasonWeek(forecast, week, fallbackSeason),
      ),
  ).length
}

type HabitCounts = {
  follows: number
  eligible: number
}

type InsightKey = ProfileSignalKey

type Candidate = {
  key: InsightKey
  label: string
  detail: string
  insight: string
  hits: number
  eligible: number
  directionalRate: number
  strength: number
}

const PRIOR_PICKS = 4
/** Below this many chances a tendency is shown, but labeled thin. */
const THIN_SAMPLE = 12
const ACTIVE_RULES: Record<
  HabitKey,
  { minimum: number; minimumRate: number }
> = {
  home: { minimum: 20, minimumRate: 0.6 },
  favorite: { minimum: 20, minimumRate: 0.6 },
  'line-value': { minimum: 6, minimumRate: 2 / 3 },
  public: { minimum: 6, minimumRate: 2 / 3 },
  travel: { minimum: 6, minimumRate: 2 / 3 },
  rest: { minimum: 6, minimumRate: 2 / 3 },
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
        weekIsGraded(week) &&
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
  if (key === 'travel') {
    return preferred === 'follow'
      ? `Has taken the traveling team on ${of} chances.`
      : `Has faded the traveling team on ${of} chances.`
  }
  if (key === 'rest') {
    return preferred === 'follow'
      ? `Has taken the shorter-rest side on ${of} chances.`
      : `Has taken the more-rested side on ${of} chances.`
  }
  return preferred === 'follow'
    ? `Has taken home favorites on ${of} such matchups.`
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
    hits,
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

/**
 * The home-favorite cross restates the home and favorite axes, so only the
 * strongest of that group earns a row.
 */
function distinctCandidates(ranked: Candidate[]) {
  return ranked.reduce<Candidate[]>(
    (kept, candidate) =>
      kept.some((row) => redundantInsight(row.key, candidate.key))
        ? kept
        : [...kept, candidate],
    [],
  )
}

export function buildPlayerPredictionProfile(
  entryId: string,
  targetWeek: number,
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  targetSeason = history.pool.seasonYear,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
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
  const travel: HabitCounts = { follows: 0, eligible: 0 }
  const rest: HabitCounts = { follows: 0, eligible: 0 }
  const homeFavorite: HabitCounts = { follows: 0, eligible: 0 }

  for (const pick of picks) {
    const rec = recs.get(pick.cbsEventId)
    const neutralSite = rec ? recIsNeutralSite(rec) : false
    if (!neutralSite) {
      home.eligible += 1
      if (pick.pickedSide === 'home') home.follows += 1
    }

    const favoriteSide = sideForFavorite(pick.homeSpread)
    if (favoriteSide) {
      favorite.eligible += 1
      if (pick.pickedSide === favoriteSide) favorite.follows += 1
    }

    if (!neutralSite && pick.homeSpread < 0) {
      homeFavorite.eligible += 1
      if (pick.pickedSide === 'home') homeFavorite.follows += 1
    }

    if (rec?.source === 'line-value' && rec.recommendedSide) {
      lineValue.eligible += 1
      if (pick.pickedSide === rec.recommendedSide) lineValue.follows += 1
    }
    if (rec?.source === 'public-consensus' && rec.pickedSide) {
      publicSide.eligible += 1
      if (pick.pickedSide === rec.pickedSide) publicSide.follows += 1
    }

    const sides = appearancePair(travelRestByAppearance, pick.cbsEventId)
    const traveler = travelingSide(sides.away?.travel, sides.home?.travel)
    if (traveler) {
      travel.eligible += 1
      if (pick.pickedSide === traveler) travel.follows += 1
    }
    const shorter = shorterRestSide(sides.away?.rest, sides.home?.rest)
    if (shorter) {
      rest.eligible += 1
      if (pick.pickedSide === shorter) rest.follows += 1
    }
  }

  const habits = {
    home: makeHabit('home', 'Home teams', home),
    favorite: makeHabit('favorite', 'Favorites', favorite),
    'line-value': makeHabit('line-value', 'Line-value side', lineValue),
    public: makeHabit('public', 'Public side', publicSide),
    travel: makeHabit('travel', 'Traveling teams', travel),
    rest: makeHabit('rest', 'Rest edge', rest),
  }

  if (picks.length < 20) {
    return {
      archetype: 'Building profile',
      archetypeDetail: `${picks.length} graded picks; 20 are needed before assigning a style`,
      signals: [],
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
    habitCandidate(
      habits.travel,
      'Traveling-team lean',
      'Traveling-team fader',
    ),
    habitCandidate(habits.rest, 'Short-rest lean', 'Rested-team lean'),
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
        hits,
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
      `${picks.length} graded picks, but no tendency is strong enough to label`,
    signals: distinctCandidates(ranked).map((candidate) => ({
      key: candidate.key,
      label: candidate.label,
      detail: candidate.detail,
      sentence: candidate.insight,
      hits: candidate.hits,
      eligible: candidate.eligible,
      rate: candidate.directionalRate,
      thin: candidate.eligible < THIN_SAMPLE,
    })),
    picks: picks.length,
    habits,
  }
}

export type PlayerReadability = {
  score: number
  solidSignals: number
  thinSignals: number
  picks: number
  label: string
  detail: string
}

function signalStrength(signal: ProfileSignal) {
  const shrunk = (signal.rate - 0.5) * 2 * Math.min(1, signal.eligible / 20)
  return signal.thin ? shrunk * 0.5 : shrunk
}

/**
 * How described a player is: peaked, non-thin tendencies first, then volume.
 * A coin-flip regular ranks below a loud habit even if they have more picks.
 */
export function playerReadability(
  profile: PlayerPredictionProfile,
): PlayerReadability {
  const solidSignals = profile.signals.filter((signal) => !signal.thin).length
  const thinSignals = profile.signals.filter((signal) => signal.thin).length
  const strength = profile.signals.reduce(
    (sum, signal) => sum + signalStrength(signal),
    0,
  )
  const score = strength * 100 + Math.min(profile.picks, 200) / 100
  const firstSolid = profile.signals.find((signal) => !signal.thin)

  if (profile.picks < 20) {
    return {
      score,
      solidSignals,
      thinSignals,
      picks: profile.picks,
      label: 'Still building',
      detail: `${profile.picks} graded ${profile.picks === 1 ? 'pick' : 'picks'}`,
    }
  }
  if (solidSignals === 0 && thinSignals === 0) {
    return {
      score,
      solidSignals,
      thinSignals,
      picks: profile.picks,
      label: 'No pattern yet',
      detail: `${profile.picks} graded picks, none loud enough`,
    }
  }
  if (solidSignals === 0) {
    return {
      score,
      solidSignals,
      thinSignals,
      picks: profile.picks,
      label: 'Thin reads only',
      detail: `${thinSignals} thin ${
        thinSignals === 1 ? 'tendency' : 'tendencies'
      } · ${profile.picks} picks`,
    }
  }
  if (solidSignals === 1) {
    return {
      score,
      solidSignals,
      thinSignals,
      picks: profile.picks,
      label: 'One clear tendency',
      detail: firstSolid
        ? `${firstSolid.label} · ${profile.picks} picks`
        : `${profile.picks} picks`,
    }
  }
  return {
    score,
    solidSignals,
    thinSignals,
    picks: profile.picks,
    label: 'Well described',
    detail: `${solidSignals} solid tendencies · ${profile.picks} picks`,
  }
}

export function comparePlayerReadability(
  left: PlayerReadability,
  right: PlayerReadability,
) {
  if (right.score !== left.score) return right.score - left.score
  if (right.solidSignals !== left.solidSignals) {
    return right.solidSignals - left.solidSignals
  }
  if (right.picks !== left.picks) return right.picks - left.picks
  return 0
}

/**
 * Profile trained through every graded week, for the player header. Weekly
 * forecasts stay on the leak-free profile that only sees earlier weeks.
 */
export function buildCurrentPlayerProfile(
  entryId: string,
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
): PlayerPredictionProfile {
  const fallbackSeason = history.pool.seasonYear
  const latest = history.weeks
    .filter(weekIsGraded)
    .reduce<{ week: number; seasonYear?: number } | null>((best, week) => {
      if (!best) return week
      return weekIsBefore(
        best,
        week.week,
        weekSeason(week, fallbackSeason),
        fallbackSeason,
      )
        ? week
        : best
    }, null)

  return buildPlayerPredictionProfile(
    entryId,
    (latest?.week ?? 1) + 1,
    history,
    recommendations,
    weekSeason(latest ?? {}, fallbackSeason),
    travelRestByAppearance,
  )
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

type HabitCall = {
  habit: Habit
  followsSide: 'home' | 'away'
  reason: string
}

function chooseHabitCall(candidates: HabitCall[]): (HabitCall & { agreed: boolean }) | null {
  const ranked = [...candidates].sort(
    (left, right) => right.habit.strength - left.habit.strength,
  )
  if (ranked.length === 0) return null
  if (ranked.length === 1) return { ...ranked[0], agreed: false }

  const first = ranked[0]
  const second = ranked[1]
  if (!first || !second) return null
  const firstSide = predictedSideFromHabit(first.habit, first.followsSide)
  const secondSide = predictedSideFromHabit(second.habit, second.followsSide)
  if (
    firstSide === secondSide ||
    first.habit.strength - second.habit.strength >= 0.08
  ) {
    return {
      ...first,
      agreed: firstSide === secondSide,
      reason:
        firstSide === secondSide
          ? `${first.reason} + ${second.reason.toLowerCase()}`
          : first.reason,
    }
  }
  return null
}

function travelRestCalls(
  game: FrozenRecommendation,
  profile: PlayerPredictionProfile,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
): HabitCall[] {
  const sides = appearancePair(travelRestByAppearance, game.cbsEventId)
  const traveler = travelingSide(sides.away?.travel, sides.home?.travel)
  const shorter = shorterRestSide(sides.away?.rest, sides.home?.rest)
  return [
    profile.habits.travel.active && traveler
      ? {
          habit: profile.habits.travel,
          followsSide: traveler,
          reason: 'Travel habit',
        }
      : null,
    profile.habits.rest.active && shorter
      ? {
          habit: profile.habits.rest,
          followsSide: shorter,
          reason: 'Rest habit',
        }
      : null,
  ].filter((row): row is HabitCall => row != null)
}

function predictGame(
  game: FrozenRecommendation,
  profile: PlayerPredictionProfile,
  actualSide: 'home' | 'away' | null,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
): PredictedGame {
  const situational =
    game.source === 'line-value' && game.recommendedSide
      ? {
          habit: profile.habits['line-value'],
          followsSide: game.recommendedSide,
          reason: 'Line-value habit',
        }
      : game.source === 'public-consensus' && game.pickedSide
        ? {
            habit: profile.habits.public,
            followsSide: game.pickedSide,
            reason: 'Public-side habit',
          }
        : null

  const extra = travelRestCalls(game, profile, travelRestByAppearance)
  let chosen: (HabitCall & { agreed: boolean }) | null = null

  if (situational?.habit.active) {
    const predicted = predictedSideFromHabit(
      situational.habit,
      situational.followsSide,
    )
    const agreed = extra.some(
      (row) =>
        predictedSideFromHabit(row.habit, row.followsSide) === predicted,
    )
    chosen = { ...situational, agreed }
  } else {
    chosen = chooseHabitCall([
      ...extra,
      profile.habits.home.active && !recIsNeutralSite(game)
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
    ].filter((row): row is HabitCall => row != null))
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
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
): PlayerPrediction {
  const targetSeason = weekSeason(week, history.pool.seasonYear)
  const profile = buildPlayerPredictionProfile(
    entryId,
    week.week,
    history,
    recommendations,
    targetSeason,
    travelRestByAppearance,
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
      travelRestByAppearance,
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
            weekIsGraded(historyWeek) &&
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
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
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
                weekIsGraded(historyWeek),
            ),
          )
          .flatMap(
            (week) =>
              predictPlayerWeek(
                entryId,
                week,
                history,
                recommendations,
                travelRestByAppearance,
              ).games,
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
    .filter(
      (week) =>
        week.strategyId === PREDICTION_STRATEGY_ID && Boolean(week.frozenAt),
    )
    .flatMap((week) => week.players.flatMap((player) => player.games))
  return summarizeResidualGames(games, capturedAt)
}

function summarizeResidualGames(
  games: PredictedGame[],
  capturedAt: string,
): PredictionResidualReport | null {
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

export function summarizePlayerPredictionResiduals(
  forecasts: PredictionForecasts | null | undefined,
  entryId: string,
  seasonYear: number,
): PredictionResidualReport | null {
  if (!forecasts) return null
  const games = forecasts.weeks
    .filter(
      (week) =>
        week.strategyId === PREDICTION_STRATEGY_ID &&
        Boolean(week.frozenAt) &&
        weekSeason(week, seasonYear) === seasonYear,
    )
    .flatMap(
      (week) =>
        week.players.find((player) => player.entryId === entryId)?.games ?? [],
    )
  return summarizeResidualGames(games, forecasts.updatedAt)
}

export function snapshotPlayerForecasts(
  history: PlayerHistory,
  recommendations: RecommendationHistory,
  previous: PredictionForecasts | null,
  now = Date.now(),
  slate?: Slate | null,
  lastKickoff: LastKickoffFile | null = null,
): PredictionForecasts {
  const travelRestByAppearance = slate
    ? buildTravelRestIndex(slate, recommendations, lastKickoff).byAppearance
    : undefined
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
        travelRestByAppearance,
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
            weekIsGraded(historyWeek) &&
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
