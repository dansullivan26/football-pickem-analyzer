import type { CardOverrideGame, CardOverrides } from './types.ts'

export const cardDeviationStorageKey = (seasonYear: number, week: number) =>
  `card-deviations:${seasonYear}:${week}`

export function sentGamesForWeek(
  overrides: CardOverrides | null | undefined,
  week: number,
) {
  return overrides?.weeks.find((row) => row.week === week)?.games ?? []
}

export function deviationIdsForWeek(
  overrides: CardOverrides | null | undefined,
  week: number,
) {
  return sentGamesForWeek(overrides, week)
    .filter((game) => game.deviate)
    .map((game) => game.gameId)
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

export type SentCardPick = {
  gameId: string
  pickedSide?: 'home' | 'away'
  deviate?: boolean
  manual?: boolean
}

function overrideFromPayload(pick: SentCardPick): CardOverrideGame | null {
  if (!pick.gameId) return null
  const pickedSide =
    pick.pickedSide === 'home' || pick.pickedSide === 'away'
      ? pick.pickedSide
      : undefined
  if (!pickedSide && pick.deviate !== true) return null
  return {
    gameId: pick.gameId,
    ...(pickedSide ? { pickedSide } : {}),
    ...(pick.deviate === true ? { deviate: true as const } : {}),
    ...(pick.manual === true ? { manual: true as const } : {}),
  }
}

/**
 * Later sends only list games still on that card. Keep prior sent sides and
 * flips for games omitted from this payload. Games in the payload take the
 * new side and deviate flag.
 */
export function mergeOverrideGames(
  existing: CardOverrideGame[] | undefined,
  payloadPicks: SentCardPick[],
): CardOverrideGame[] {
  const seen = new Set(payloadPicks.map((pick) => pick.gameId))
  const kept = (existing ?? []).filter((game) => !seen.has(game.gameId))
  const next = payloadPicks.flatMap((pick) => {
    const row = overrideFromPayload(pick)
    return row ? [row] : []
  })
  const byId = new Map<string, CardOverrideGame>()
  for (const game of [...kept, ...next]) byId.set(game.gameId, game)
  return [...byId.values()]
}
