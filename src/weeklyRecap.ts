import type {
  PredictionForecastWeek,
} from './playerPrediction.ts'
import type {
  CoverResult,
  FrozenRecommendation,
  PlayerWeek,
  RecommendationWeek,
} from './types.ts'

export type WeeklyRecap = {
  week: number
  label: string
  pool: string[]
  players: string[]
  teamsAndLeagues: string[]
  card: string[]
}

type Side = 'home' | 'away'

type PoolGame = {
  game: FrozenRecommendation
  home: number
  away: number
  made: number
}

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`
}

function sideTeam(game: FrozenRecommendation, side: Side) {
  return side === 'home' ? game.home : game.away
}

function favoriteSide(game: FrozenRecommendation): Side | null {
  if (game.homeSpread === 0) return null
  return game.homeSpread < 0 ? 'home' : 'away'
}

function pickedSpread(game: FrozenRecommendation, side: Side) {
  return game.homeSpread * (side === 'away' ? -1 : 1)
}

function formatSpread(value: number) {
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? Math.abs(value).toFixed(0)
    : Math.abs(value).toFixed(1)
  return value > 0 ? `+${points}` : `-${points}`
}

function decidedCover(cover: CoverResult): cover is Side {
  return cover === 'home' || cover === 'away'
}

function poolGames(
  playerWeek: PlayerWeek,
  recommendationWeek: RecommendationWeek,
) {
  const byEvent = new Map(
    recommendationWeek.games.map((game) => [
      game.cbsEventId,
      { game, home: 0, away: 0, made: 0 } satisfies PoolGame,
    ]),
  )
  for (const entry of playerWeek.entries) {
    for (const pick of entry.picks) {
      const row = byEvent.get(pick.cbsEventId)
      if (!row || !pick.pickedSide) continue
      row[pick.pickedSide] += 1
      row.made += 1
    }
  }
  return [...byEvent.values()]
}

function leaderboardCopy(playerWeek: PlayerWeek) {
  const ranked = playerWeek.entries
    .filter((entry) => entry.weekScore != null)
    .sort(
      (left, right) =>
        (right.weekScore ?? 0) - (left.weekScore ?? 0) ||
        (left.weekRank ?? Number.MAX_SAFE_INTEGER) -
          (right.weekRank ?? Number.MAX_SAFE_INTEGER),
    )
  const high = ranked[0]?.weekScore
  if (high == null) return null
  const leaders = ranked.filter((entry) => entry.weekScore === high)
  const names = leaders.map((entry) => entry.name).join(' and ')
  return `${names} ${leaders.length === 1 ? 'led' : 'shared the lead'} at ${high} wins.`
}

function poolMajorityCopy(games: PoolGame[]) {
  let wins = 0
  let losses = 0
  let splits = 0
  for (const row of games) {
    if (!decidedCover(row.game.cover) || row.home === row.away) {
      if (row.home === row.away && decidedCover(row.game.cover)) splits += 1
      continue
    }
    const majority: Side = row.home > row.away ? 'home' : 'away'
    if (majority === row.game.cover) wins += 1
    else losses += 1
  }
  if (wins + losses === 0) return null
  return `The pool majority went ${wins}-${losses} ATS${splits ? `, with ${plural(splits, 'split game')}` : ''}.`
}

function poolExtremeCopy(games: PoolGame[], kind: 'fade' | 'chalk') {
  const rows = games
    .filter((row) => decidedCover(row.game.cover) && row.made > 0)
    .map((row) => {
      const cover = row.game.cover as Side
      const support = row[cover]
      return { row, cover, support, rate: support / row.made }
    })
    .sort((left, right) =>
      kind === 'fade'
        ? left.rate - right.rate
        : right.rate - left.rate,
    )
  const extreme = rows[0]
  if (!extreme) return null
  if (kind === 'fade' && extreme.rate >= 0.5) return null
  if (kind === 'chalk' && extreme.rate <= 0.5) return null
  const { game } = extreme.row
  const team = sideTeam(game, extreme.cover)
  const spread = formatSpread(pickedSpread(game, extreme.cover))
  const percent = Math.round(extreme.rate * 100)
  return kind === 'fade'
    ? `${team} ${spread} was the sharpest pool fade to cash: ${extreme.support} of ${extreme.row.made} picks (${percent}%).`
    : `${team} ${spread} was the strongest winning chalk: ${extreme.support} of ${extreme.row.made} picks (${percent}%).`
}

function forecastRows(forecastWeek: PredictionForecastWeek | undefined) {
  return (forecastWeek?.players ?? [])
    .map((player) => {
      const graded = player.games.filter((game) => game.correct != null)
      const correct = graded.filter((game) => game.correct).length
      return {
        name: player.name,
        archetype: player.archetype,
        graded: graded.length,
        correct,
        rate: graded.length ? correct / graded.length : null,
      }
    })
    .filter(
      (row): row is typeof row & { rate: number } =>
        row.rate != null && row.graded >= 8,
    )
}

function playerStandoutCopy(
  rows: ReturnType<typeof forecastRows>,
  kind: 'held' | 'broke',
) {
  const sorted = [...rows].sort((left, right) =>
    kind === 'held'
      ? right.rate - left.rate || right.graded - left.graded
      : left.rate - right.rate || right.graded - left.graded,
  )
  const row = sorted[0]
  if (!row) return null
  if (kind === 'held' && row.rate < 0.7) return null
  if (kind === 'broke' && row.rate >= 0.5) return null
  const percent = Math.round(row.rate * 100)
  return kind === 'held'
    ? `${row.name} most clearly played to the frozen ${row.archetype.toLowerCase()} read: ${row.correct} of ${row.graded} called picks (${percent}%).`
    : `${row.name} moved furthest away from the frozen ${row.archetype.toLowerCase()} read: only ${row.correct} of ${row.graded} called picks (${percent}%).`
}

function habitCopy(forecastWeek: PredictionForecastWeek | undefined) {
  const counts = new Map<string, { correct: number; graded: number }>()
  for (const player of forecastWeek?.players ?? []) {
    for (const game of player.games) {
      if (!game.habitKey || game.correct == null) continue
      const count = counts.get(game.habitKey) ?? { correct: 0, graded: 0 }
      count.graded += 1
      if (game.correct) count.correct += 1
      counts.set(game.habitKey, count)
    }
  }
  const labels: Record<string, string> = {
    favorite: 'Favorite/dog',
    'line-value': 'Line-value',
    home: 'Home/road',
    public: 'Public-side',
    travel: 'Travel',
    rest: 'Rest',
  }
  const strongest = [...counts.entries()]
    .filter(([, count]) => count.graded >= 12)
    .sort(
      (left, right) =>
        right[1].correct / right[1].graded -
          left[1].correct / left[1].graded ||
        right[1].graded - left[1].graded,
    )[0]
  if (!strongest) return null
  const [key, count] = strongest
  return `${labels[key] ?? key} calls were the clearest pool-wide read, naming ${count.correct} of ${count.graded} submitted sides (${Math.round((count.correct / count.graded) * 100)}%).`
}

function leagueCopy(
  games: FrozenRecommendation[],
  sport: 'NFL' | 'NCAAF',
) {
  const rows = games.filter(
    (game) => game.sport === sport && decidedCover(game.cover),
  )
  let favorites = 0
  let dogs = 0
  for (const game of rows) {
    const favorite = favoriteSide(game)
    if (!favorite) continue
    if (game.cover === favorite) favorites += 1
    else dogs += 1
  }
  if (favorites + dogs === 0) return null
  const league = sport === 'NFL' ? 'NFL' : 'College'
  if (favorites === dogs) {
    return `${league} favorites and underdogs split ${favorites}-${dogs} ATS.`
  }
  const leader = favorites > dogs ? 'favorites' : 'underdogs'
  return `${league} ${leader} led ${Math.max(favorites, dogs)}-${Math.min(favorites, dogs)} ATS.`
}

function largestFavoriteMiss(games: FrozenRecommendation[]) {
  const misses = games
    .filter((game) => {
      const favorite = favoriteSide(game)
      return favorite && decidedCover(game.cover) && game.cover !== favorite
    })
    .sort(
      (left, right) =>
        Math.abs(right.homeSpread) - Math.abs(left.homeSpread),
    )
  const game = misses[0]
  if (!game) return null
  const dog = game.cover as Side
  return `${sideTeam(game, dog)} ${formatSpread(pickedSpread(game, dog))} delivered the largest favorite fade, covering against ${sideTeam(game, favoriteSide(game) as Side)}.`
}

function cardCopy(games: FrozenRecommendation[]) {
  const called = games.filter(
    (game) => game.recommendedSide && game.cover != null,
  )
  let wins = 0
  let losses = 0
  let pushes = 0
  for (const game of called) {
    if (game.cover === 'push') pushes += 1
    else if (game.cover === game.recommendedSide) wins += 1
    else losses += 1
  }
  if (called.length === 0) return null
  return `The frozen recommendation card finished ${wins}-${losses}${pushes ? `-${pushes}` : ''} ATS on ${plural(called.length, 'call')}.`
}

function cardTierCopy(games: FrozenRecommendation[]) {
  const stats = new Map<string, { wins: number; losses: number }>()
  for (const game of games) {
    if (!game.recommendedSide || !decidedCover(game.cover)) continue
    const row = stats.get(game.category) ?? { wins: 0, losses: 0 }
    if (game.cover === game.recommendedSide) row.wins += 1
    else row.losses += 1
    stats.set(game.category, row)
  }
  const best = [...stats.entries()]
    .filter(([, row]) => row.wins + row.losses >= 2)
    .sort(
      (left, right) =>
        right[1].wins / (right[1].wins + right[1].losses) -
          left[1].wins / (left[1].wins + left[1].losses) ||
        right[1].wins + right[1].losses -
          (left[1].wins + left[1].losses),
    )[0]
  if (!best) return null
  const [tier, row] = best
  return `${tier[0]?.toUpperCase()}${tier.slice(1)} calls led the tiers at ${row.wins}-${row.losses} ATS.`
}

function compact(rows: Array<string | null>) {
  return rows.filter((row): row is string => row != null)
}

/**
 * A deterministic caption over frozen/scored data. It deliberately returns
 * nothing until CBS marks the player week scored, so an in-progress slate
 * cannot be mistaken for the official recap.
 */
export function buildWeeklyRecap(
  playerWeek: PlayerWeek | undefined,
  recommendationWeek: RecommendationWeek | undefined,
  forecastWeek: PredictionForecastWeek | undefined,
): WeeklyRecap | null {
  if (!playerWeek?.scored || !recommendationWeek) return null
  const games = poolGames(playerWeek, recommendationWeek)
  const forecasts = forecastRows(forecastWeek)
  const playerBullets = compact([
    habitCopy(forecastWeek),
    playerStandoutCopy(forecasts, 'held'),
    playerStandoutCopy(forecasts, 'broke'),
  ])
  return {
    week: playerWeek.week,
    label: playerWeek.label,
    pool: compact([
      leaderboardCopy(playerWeek),
      poolMajorityCopy(games),
      poolExtremeCopy(games, 'fade'),
      poolExtremeCopy(games, 'chalk'),
    ]),
    players: playerBullets.length
      ? playerBullets
      : [
          'No player tendency was eligible for a leak-free weekly call yet; the first scored week only builds the prior.',
        ],
    teamsAndLeagues: compact([
      leagueCopy(recommendationWeek.games, 'NFL'),
      leagueCopy(recommendationWeek.games, 'NCAAF'),
      largestFavoriteMiss(recommendationWeek.games),
    ]),
    card: compact([
      cardCopy(recommendationWeek.games),
      cardTierCopy(recommendationWeek.games),
    ]),
  }
}
