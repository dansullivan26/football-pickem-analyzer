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
