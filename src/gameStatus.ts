import type { SlateGame } from './types'

const FINAL_STATUSES = new Set([
  'FINAL',
  'FINAL_OT',
  'FINAL/OT',
  'CLOSED',
  'COMPLETE',
  'COMPLETED',
  'OFFICIAL',
])

export function gameScores(game: {
  awayScore?: number | null
  homeScore?: number | null
}) {
  if (
    typeof game.awayScore !== 'number' ||
    typeof game.homeScore !== 'number'
  ) {
    return null
  }
  return { away: game.awayScore, home: game.homeScore }
}

export function formatGameScore(game: {
  awayScore?: number | null
  homeScore?: number | null
}) {
  const scores = gameScores(game)
  return scores ? `${scores.away}–${scores.home}` : null
}

/** Winning (larger) score first. Used on Teams/Players badges, not the Lines matchup. */
export function formatWinningScore(game: {
  awayScore?: number | null
  homeScore?: number | null
}) {
  const scores = gameScores(game)
  if (!scores) return null
  const high = Math.max(scores.away, scores.home)
  const low = Math.min(scores.away, scores.home)
  return `${high}–${low}`
}

/** Later sources overwrite earlier ones so the live slate can beat a frozen rec. */
export function mergeEventScores(
  sources: Array<
    Iterable<{
      cbsEventId: number
      awayScore?: number | null
      homeScore?: number | null
    }>
  >,
) {
  const map = new Map<number, { awayScore: number; homeScore: number }>()
  for (const source of sources) {
    for (const game of source) {
      const scores = gameScores(game)
      if (!scores) continue
      map.set(game.cbsEventId, {
        awayScore: scores.away,
        homeScore: scores.home,
      })
    }
  }
  return map
}

export function gameIsUpcoming(game: Pick<SlateGame, 'kickoff'>, now: number) {
  return new Date(game.kickoff).getTime() > now
}

export function gameIsFinal(game: {
  status: string
  awayScore?: number | null
  homeScore?: number | null
}) {
  return (
    FINAL_STATUSES.has(game.status.trim().toUpperCase()) ||
    gameScores(game) != null
  )
}

export function gameIsCompleted(
  game: Pick<SlateGame, 'kickoff' | 'status'> & {
    awayScore?: number | null
    homeScore?: number | null
  },
  now: number,
) {
  return gameIsFinal(game) || !gameIsUpcoming(game, now)
}

export function etDayKey(value: string | number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

export function formatEtDayLabel(kickoff: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
    .format(new Date(kickoff))
    .replace(',', '')
}

export function gameIsOnEtDay(
  game: Pick<SlateGame, 'kickoff'>,
  dayKey: string,
) {
  return etDayKey(game.kickoff) === dayKey
}

export function slateKickoffDays(
  games: Array<Pick<SlateGame, 'kickoff'>>,
  now = Date.now(),
) {
  const today = etDayKey(now)
  const days = new Map<
    string,
    { key: string; label: string; isToday: boolean }
  >()
  for (const game of games) {
    const key = etDayKey(game.kickoff)
    if (!key || days.has(key)) continue
    days.set(key, {
      key,
      label: formatEtDayLabel(game.kickoff),
      isToday: key === today,
    })
  }
  return [...days.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  )
}
