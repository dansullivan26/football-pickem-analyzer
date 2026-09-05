import type { PlayerPick } from './types.ts'

export function formatSpread(value: number) {
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? Math.abs(value).toFixed(0)
    : Math.abs(value).toFixed(1)
  return value > 0 ? `+${points}` : `-${points}`
}

export function pickSelectionLabel(pick: PlayerPick) {
  if (!pick.pickedSide || !pick.pickedTeam) return 'No pick recorded'
  const spread =
    pick.pickedSide === 'home' ? pick.homeSpread : pick.homeSpread * -1
  return `${pick.pickedTeam} ${formatSpread(spread)}`
}

export type PickResultState =
  | 'ambiguous'
  | 'unmatched'
  | 'miss'
  | 'win'
  | 'loss'
  | 'push'
  | 'pending'
  | 'awaiting'

const RESULT_LABELS: Record<PickResultState, string> = {
  ambiguous: 'Needs review',
  unmatched: 'Unmatched',
  miss: 'Missed',
  win: 'win',
  loss: 'loss',
  push: 'push',
  pending: 'Pending',
  awaiting: 'Awaiting results',
}

/**
 * A pick with no side is settled once CBS grades it (misses come back as a
 * `loss`) or once the game is final; only ungraded, unfinished games are still
 * awaiting results.
 */
export function pickResultState(
  pick: PlayerPick,
  isFinal = false,
): PickResultState {
  if (pick.matchStatus === 'ambiguous') return 'ambiguous'
  if (pick.matchStatus === 'unmatched') return 'unmatched'
  if (!pick.pickedSide) {
    return pick.result || isFinal ? 'miss' : 'awaiting'
  }
  if (!pick.result) return 'pending'
  return pick.result
}

export function pickResultLabel(pick: PlayerPick, isFinal = false) {
  return RESULT_LABELS[pickResultState(pick, isFinal)]
}
