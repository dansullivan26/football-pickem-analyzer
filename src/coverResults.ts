import type {
  CoverResult,
  PlayerHistory,
  RecommendationHistory,
} from './types'

export function coverFromPlayerPick(
  pickedSide: 'home' | 'away',
  result: 'win' | 'loss' | 'push',
): Exclude<CoverResult, null> {
  if (result === 'push') return 'push'
  if (result === 'win') return pickedSide
  return pickedSide === 'home' ? 'away' : 'home'
}

function coverKey(week: number, cbsEventId: number) {
  return `${week}:${cbsEventId}`
}

/** One ATS cover per game when every graded pick agrees. */
export function coversFromPlayerHistory(
  history: PlayerHistory,
): Map<string, Exclude<CoverResult, null>> {
  const votes = new Map<string, Set<Exclude<CoverResult, null>>>()

  for (const week of history.weeks) {
    for (const entry of week.entries) {
      for (const pick of entry.picks) {
        if (pick.pickedSide !== 'home' && pick.pickedSide !== 'away') continue
        if (
          pick.result !== 'win' &&
          pick.result !== 'loss' &&
          pick.result !== 'push'
        ) {
          continue
        }

        const cover = coverFromPlayerPick(pick.pickedSide, pick.result)
        const key = coverKey(week.week, pick.cbsEventId)
        const seen = votes.get(key) ?? new Set()
        seen.add(cover)
        votes.set(key, seen)
      }
    }
  }

  const covers = new Map<string, Exclude<CoverResult, null>>()
  for (const [key, seen] of votes) {
    if (seen.size === 1) {
      covers.set(key, [...seen][0])
    }
  }
  return covers
}

export function lookupCover(
  covers: Map<string, Exclude<CoverResult, null>>,
  week: number,
  cbsEventId: number,
): CoverResult {
  return covers.get(coverKey(week, cbsEventId)) ?? null
}

export function applyCoversToRecommendations(
  recommendations: RecommendationHistory,
  covers: Map<string, Exclude<CoverResult, null>>,
  updatedAt = new Date().toISOString(),
) {
  let applied = 0
  const weeks = recommendations.weeks.map((week) => ({
    ...week,
    games: week.games.map((game) => {
      const cover = lookupCover(covers, week.week, game.cbsEventId)
      if (!cover || cover === game.cover) return game
      applied += 1
      return { ...game, cover }
    }),
  }))

  return {
    next: { ...recommendations, updatedAt, weeks },
    applied,
  }
}
