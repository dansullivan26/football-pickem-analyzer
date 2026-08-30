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
