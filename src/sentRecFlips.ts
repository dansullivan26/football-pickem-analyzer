import { gameIsUpcoming } from './gameStatus.ts'
import { formatPoolSpread } from './cardScoring.ts'
import type { CardOverrideGame, SlateGame } from './types.ts'
import type { SuggestedPick } from './cardStrategy.ts'

export type SentRecommendationFlip = {
  gameId: string
  cbsEventId: number
  away: string
  home: string
  kickoff: string
  sentSide: 'home' | 'away'
  sentTeam: string
  sentLine: string
  nowSide: 'home' | 'away'
  nowTeam: string
  nowLine: string
}

export function sentRecFlipStorageKey(seasonYear: number, week: number) {
  return `heads-up-flips:${seasonYear}:${week}`
}

export function sentRecFlipSignature(flips: readonly SentRecommendationFlip[]) {
  return flips
    .map((flip) => `${flip.gameId}:${flip.sentSide}:${flip.nowSide}`)
    .sort()
    .join('|')
}

type FlipStorage = Pick<Storage, 'getItem' | 'setItem'> | null

export function headsUpFlipsWereDismissed(
  seasonYear: number,
  week: number,
  flips: readonly SentRecommendationFlip[],
  storage: FlipStorage = typeof localStorage === 'undefined' ? null : localStorage,
) {
  if (!storage || flips.length === 0) return false
  try {
    return (
      storage.getItem(sentRecFlipStorageKey(seasonYear, week)) ===
      sentRecFlipSignature(flips)
    )
  } catch {
    return false
  }
}

export function dismissHeadsUpFlips(
  seasonYear: number,
  week: number,
  flips: readonly SentRecommendationFlip[],
  storage: FlipStorage = typeof localStorage === 'undefined' ? null : localStorage,
) {
  if (!storage) return
  try {
    storage.setItem(
      sentRecFlipStorageKey(seasonYear, week),
      sentRecFlipSignature(flips),
    )
  } catch {
    // Private mode can block localStorage.
  }
}

function sideLine(game: SlateGame, side: 'home' | 'away') {
  return `${game[side].name} ${formatPoolSpread(
    side === 'home' ? game.homeSpread : -game.homeSpread,
  )}`
}

/** Sent CBS side vs the live card, only before kickoff. */
export function sentRecommendationFlips(
  games: readonly SlateGame[],
  sent: readonly CardOverrideGame[],
  picks: readonly SuggestedPick[],
  now: number,
): SentRecommendationFlip[] {
  const slateById = new Map(games.map((game) => [game.id, game]))
  const pickById = new Map(picks.map((pick) => [pick.gameId, pick]))
  const flips: SentRecommendationFlip[] = []
  for (const row of sent) {
    if (row.pickedSide !== 'home' && row.pickedSide !== 'away') continue
    const game = slateById.get(row.gameId)
    if (!game || !gameIsUpcoming(game, now)) continue
    const pick = pickById.get(row.gameId)
    if (!pick || pick.pickedSide === row.pickedSide) continue
    flips.push({
      gameId: game.id,
      cbsEventId: game.cbsEventId,
      away: game.away.name,
      home: game.home.name,
      kickoff: game.kickoff,
      sentSide: row.pickedSide,
      sentTeam: game[row.pickedSide].name,
      sentLine: sideLine(game, row.pickedSide),
      nowSide: pick.pickedSide,
      nowTeam: game[pick.pickedSide].name,
      nowLine: sideLine(game, pick.pickedSide),
    })
  }
  return flips.sort(
    (left, right) =>
      left.kickoff.localeCompare(right.kickoff) ||
      left.cbsEventId - right.cbsEventId,
  )
}
