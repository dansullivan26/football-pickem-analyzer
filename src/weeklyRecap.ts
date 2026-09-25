import type {
  PredictionForecastWeek,
} from './playerPrediction.ts'
import {
  formatNetEdgePoints,
  largestNetEdgePlay,
  summarizeNetEdgeBuckets,
} from './recommendationEdge.ts'
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

export type RecapScope = 'week' | 'season'

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
        entryId: player.entryId,
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

function playerMovementCopies(
  rows: ReturnType<typeof forecastRows>,
  kind: 'strengthened' | 'weakened',
) {
  const sorted = [...rows].sort((left, right) =>
    kind === 'strengthened'
      ? right.rate - left.rate || right.graded - left.graded
      : left.rate - right.rate || right.graded - left.graded,
  )
  return sorted
    .filter((row) =>
      kind === 'strengthened'
        ? row.rate >= 0.7 && row.correct - (row.graded - row.correct) >= 3
        : row.rate <= 0.4 && row.graded - row.correct - row.correct >= 3,
    )
    .slice(0, 2)
    .map((row) => {
      const percent = Math.round(row.rate * 100)
      return kind === 'strengthened'
        ? `Profile strengthened: ${row.name} played to the frozen ${row.archetype.toLowerCase()} read on ${row.correct} of ${row.graded} called picks (${percent}%).`
        : `Profile weakened: ${row.name} broke from the frozen ${row.archetype.toLowerCase()} read; it named only ${row.correct} of ${row.graded} picks (${percent}%).`
    })
}

function habitCopy(forecastWeeks: PredictionForecastWeek[]) {
  const counts = new Map<string, { correct: number; graded: number }>()
  for (const week of forecastWeeks) {
    for (const player of week.players) {
      for (const game of player.games) {
        if (!game.habitKey || game.correct == null) continue
        const count = counts.get(game.habitKey) ?? { correct: 0, graded: 0 }
        count.graded += 1
        if (game.correct) count.correct += 1
        counts.set(game.habitKey, count)
      }
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

function cardLargestNetCopy(games: FrozenRecommendation[]) {
  const play = largestNetEdgePlay(games)
  const side = play?.game.recommendedSide
  if (!play || !side) return null
  const game = play.game
  const team = sideTeam(game, side)
  const spread = formatSpread(pickedSpread(game, side))
  const net = formatNetEdgePoints(play.net)
  if (!decidedCover(game.cover)) {
    return `Largest net on the card is ${team} ${spread} at ${net} points.`
  }
  const hit = game.cover === side
  return `Largest net on the card was ${team} ${spread} (${net}-pt net) and it ${hit ? 'covered' : 'missed'}.`
}

function cardNetEdgeCopy(games: FrozenRecommendation[]) {
  const best = summarizeNetEdgeBuckets(games)
    .filter((row) => row.wins + row.losses >= 2)
    .sort(
      (left, right) =>
        right.wins / (right.wins + right.losses) -
          left.wins / (left.wins + left.losses) ||
        right.wins + right.losses - (left.wins + left.losses),
    )[0]
  if (!best) return null
  return `${best.label} nets led the card at ${best.wins}-${best.losses} ATS.`
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

function seasonLeaderboardCopy(playerWeeks: PlayerWeek[]) {
  const totals = new Map<string, { name: string; wins: number }>()
  for (const week of playerWeeks) {
    for (const entry of week.entries) {
      if (entry.weekScore == null) continue
      const row = totals.get(entry.entryId) ?? { name: entry.name, wins: 0 }
      row.wins += entry.weekScore
      totals.set(entry.entryId, row)
    }
  }
  const ranked = [...totals.values()].sort(
    (left, right) => right.wins - left.wins || left.name.localeCompare(right.name),
  )
  const high = ranked[0]?.wins
  if (high == null) return null
  const leaders = ranked.filter((row) => row.wins === high)
  return `${leaders.map((row) => row.name).join(' and ')} ${leaders.length === 1 ? 'leads' : 'share the lead'} through ${plural(playerWeeks.length, 'scored week')} with ${high} wins.`
}

function seasonForecastRows(forecastWeeks: PredictionForecastWeek[]) {
  const rows = new Map<
    string,
    {
      entryId: string
      name: string
      archetype: string
      correct: number
      graded: number
      weeks: number
    }
  >()
  for (const week of forecastWeeks) {
    for (const player of week.players) {
      const graded = player.games.filter((game) => game.correct != null)
      if (graded.length === 0) continue
      const row = rows.get(player.entryId) ?? {
        entryId: player.entryId,
        name: player.name,
        archetype: player.archetype,
        correct: 0,
        graded: 0,
        weeks: 0,
      }
      row.name = player.name
      row.archetype = player.archetype
      row.correct += graded.filter((game) => game.correct).length
      row.graded += graded.length
      row.weeks += 1
      rows.set(player.entryId, row)
    }
  }
  return [...rows.values()]
    .filter((row) => row.graded >= 8)
    .map((row) => ({ ...row, rate: row.correct / row.graded }))
}

function seasonProfileCopy(
  rows: ReturnType<typeof seasonForecastRows>,
  kind: 'strongest' | 'weakest',
) {
  const row = [...rows].sort((left, right) =>
    kind === 'strongest'
      ? right.rate - left.rate || right.graded - left.graded
      : left.rate - right.rate || right.graded - left.graded,
  )[0]
  if (!row) return null
  const percent = Math.round(row.rate * 100)
  return kind === 'strongest'
    ? `Strongest season read: ${row.name}'s frozen calls have named ${row.correct} of ${row.graded} picks (${percent}%) across ${plural(row.weeks, 'forecast week')}.`
    : `Least settled season read: ${row.name}'s frozen calls have named ${row.correct} of ${row.graded} picks (${percent}%) across ${plural(row.weeks, 'forecast week')}.`
}

function teamSeasonCopies(games: FrozenRecommendation[]) {
  const records = new Map<
    string,
    { team: string; wins: number; losses: number; pushes: number }
  >()
  for (const game of games) {
    if (!game.cover) continue
    for (const side of ['away', 'home'] as const) {
      const team = sideTeam(game, side)
      const key = `${game.sport}:${team}`
      const row = records.get(key) ?? {
        team,
        wins: 0,
        losses: 0,
        pushes: 0,
      }
      if (game.cover === 'push') row.pushes += 1
      else if (game.cover === side) row.wins += 1
      else row.losses += 1
      records.set(key, row)
    }
  }
  const eligible = [...records.values()].filter(
    (row) => row.wins + row.losses + row.pushes >= 3,
  )
  if (eligible.length === 0) return []
  const hottest = [...eligible].sort(
    (left, right) =>
      right.wins / Math.max(1, right.wins + right.losses) -
        left.wins / Math.max(1, left.wins + left.losses) ||
      right.wins + right.losses - (left.wins + left.losses),
  )[0]
  const coldest = [...eligible].sort(
    (left, right) =>
      left.wins / Math.max(1, left.wins + left.losses) -
        right.wins / Math.max(1, right.wins + right.losses) ||
      right.wins + right.losses - (left.wins + left.losses),
  )[0]
  return compact([
    hottest
      ? `${hottest.team} owns one of the strongest repeated team results at ${hottest.wins}-${hottest.losses}${hottest.pushes ? `-${hottest.pushes}` : ''} ATS.`
      : null,
    coldest && coldest.team !== hottest?.team
      ? `${coldest.team} owns one of the weakest repeated team results at ${coldest.wins}-${coldest.losses}${coldest.pushes ? `-${coldest.pushes}` : ''} ATS.`
      : null,
  ])
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
    habitCopy(forecastWeek ? [forecastWeek] : []),
    ...playerMovementCopies(forecasts, 'strengthened'),
    ...playerMovementCopies(forecasts, 'weakened'),
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
      cardLargestNetCopy(recommendationWeek.games),
      cardTierCopy(recommendationWeek.games),
    ]),
  }
}

/** Season-to-date recap, restricted by the caller to officially scored weeks. */
export function buildSeasonRecap(
  playerWeeks: PlayerWeek[],
  recommendationWeeks: RecommendationWeek[],
  forecastWeeks: PredictionForecastWeek[],
): WeeklyRecap | null {
  const scoredPlayerWeeks = playerWeeks
    .filter((week) => week.scored)
    .sort((left, right) => left.week - right.week)
  if (scoredPlayerWeeks.length === 0) return null
  const scoredKeys = new Set(scoredPlayerWeeks.map((week) => week.week))
  const recWeeks = recommendationWeeks.filter((week) => scoredKeys.has(week.week))
  const forecasts = forecastWeeks.filter((week) => scoredKeys.has(week.week))
  const allGames = recWeeks.flatMap((week) => week.games)
  const allPoolGames = recWeeks.flatMap((week) => {
    const playerWeek = scoredPlayerWeeks.find((row) => row.week === week.week)
    return playerWeek ? poolGames(playerWeek, week) : []
  })
  const playerRows = seasonForecastRows(forecasts)
  const teamBullets = teamSeasonCopies(allGames)
  const latest = scoredPlayerWeeks.at(-1)!
  return {
    week: latest.week,
    label: 'Season to date',
    pool: compact([
      seasonLeaderboardCopy(scoredPlayerWeeks),
      poolMajorityCopy(allPoolGames),
      poolExtremeCopy(allPoolGames, 'fade'),
      poolExtremeCopy(allPoolGames, 'chalk'),
    ]),
    players: compact([
      habitCopy(forecasts),
      seasonProfileCopy(playerRows, 'strongest'),
      seasonProfileCopy(playerRows, 'weakest'),
    ]),
    teamsAndLeagues: compact([
      leagueCopy(allGames, 'NFL'),
      leagueCopy(allGames, 'NCAAF'),
      ...teamBullets,
      largestFavoriteMiss(allGames),
    ]),
    card: compact([
      cardCopy(allGames),
      cardNetEdgeCopy(allGames),
      cardTierCopy(allGames),
    ]),
  }
}
