import type { PlayerHistory, PlayerPick } from './types'

/** CBS pool display name for the operator of this app. */
export const OUR_PLAYER_NAME = 'Dan Sullivan'

export function ourRosterEntry(history: PlayerHistory) {
  const needle = OUR_PLAYER_NAME.trim().toLowerCase()
  const matches = history.entries.filter(
    (entry) => entry.name.trim().toLowerCase() === needle,
  )
  return matches.length === 1 ? matches[0] : null
}

export function ourPickForGame(
  history: PlayerHistory,
  week: number,
  cbsEventId: number,
): PlayerPick | null {
  const owner = ourRosterEntry(history)
  if (!owner) return null
  return (
    history.weeks
      .find((row) => row.week === week)
      ?.entries.find((entry) => entry.entryId === owner.entryId)
      ?.picks.find((pick) => pick.cbsEventId === cbsEventId) ?? null
  )
}

/** Whether Dan Sullivan's CBS pool pick is this side. Null if no pick is unlocked. */
export function ourPoolPickOnSide(
  history: PlayerHistory,
  week: number,
  cbsEventId: number,
  side: 'home' | 'away',
): 'picked' | 'not-picked' | null {
  const pick = ourPickForGame(history, week, cbsEventId)
  if (!pick?.pickedSide) return null
  return pick.pickedSide === side ? 'picked' : 'not-picked'
}

/** Sad face when we took the team; shamrock when we faded them and they benefitted. */
export function badBeatSideMark(poolPick: 'picked' | 'not-picked' | null) {
  if (poolPick === 'not-picked') {
    return { emoji: '☘️', label: 'Benefitted from this bad beat' }
  }
  return { emoji: '😞', label: 'Open this bad beat' }
}
