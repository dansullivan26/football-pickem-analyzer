import type { CardOverrideGame, CardOverrides } from './types.ts'

export const cardDeviationStorageKey = (seasonYear: number, week: number) =>
  `card-deviations:${seasonYear}:${week}`

export function deviationIdsForWeek(
  overrides: CardOverrides | null | undefined,
  week: number,
) {
  const games =
    overrides?.weeks.find((row) => row.week === week)?.games ?? []
  return games.filter((game) => game.deviate).map((game) => game.gameId)
}

export function rememberedDeviationIds({
  week,
  seasonYear,
  savedIds,
  pickIds,
  storage = typeof sessionStorage === 'undefined' ? null : sessionStorage,
}: {
  week: number
  seasonYear: number
  savedIds: Iterable<string>
  pickIds: Iterable<string>
  storage?: Pick<Storage, 'getItem'> | null
}) {
  const onCard = new Set(pickIds)
  const fromFile = [...savedIds].filter((id) => onCard.has(id))
  if (!storage) return fromFile
  try {
    const raw = storage.getItem(cardDeviationStorageKey(seasonYear, week))
    if (!raw) return fromFile
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fromFile
    return parsed.filter(
      (id): id is string => typeof id === 'string' && onCard.has(id),
    )
  } catch {
    return fromFile
  }
}

export function storeDeviationIds(
  seasonYear: number,
  week: number,
  ids: Iterable<string>,
  storage = typeof sessionStorage === 'undefined' ? null : sessionStorage,
) {
  if (!storage) return
  try {
    storage.setItem(
      cardDeviationStorageKey(seasonYear, week),
      JSON.stringify([...ids]),
    )
  } catch {
    // Private mode can block sessionStorage.
  }
}

/**
 * Later sends only list games still on that card. Keep prior flips for games
 * that were not in this payload (already kicked off, or dropped from the
 * live suggested set). Games in the payload take the new deviate flag.
 */
export function mergeOverrideGames(
  existing: CardOverrideGame[] | undefined,
  payloadPicks: Array<{ gameId: string; deviate?: boolean }>,
): CardOverrideGame[] {
  const seen = new Set(payloadPicks.map((pick) => pick.gameId))
  const kept = (existing ?? []).filter(
    (game) => game.deviate && !seen.has(game.gameId),
  )
  const next = payloadPicks
    .filter((pick) => pick.deviate === true && pick.gameId)
    .map((pick) => ({ gameId: pick.gameId, deviate: true as const }))
  const byId = new Map<string, CardOverrideGame>()
  for (const game of [...kept, ...next]) byId.set(game.gameId, game)
  return [...byId.values()]
}
