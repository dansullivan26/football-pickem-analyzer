import { playerSlug } from './playerDirectory.ts'

export type MoneyPlace = {
  place: number
  name: string
  score: number
}

export type MoneySeason = {
  seasonYear: number
  places: MoneyPlace[]
}

export type MoneyHistoryFile = {
  pool: string
  moneyPlaces: number
  scoreLabel: string
  note: string
  seasons: MoneySeason[]
}

export type LinkedMoneyPlace = MoneyPlace & {
  entryId: string | null
  slug: string | null
}

export type LinkedMoneySeason = {
  seasonYear: number
  places: LinkedMoneyPlace[]
}

export function formatMoneyPlace(place: number) {
  const suffix =
    place % 100 >= 11 && place % 100 <= 13
      ? 'th'
      : place % 10 === 1
        ? 'st'
        : place % 10 === 2
          ? 'nd'
          : place % 10 === 3
            ? 'rd'
            : 'th'
  return `${place}${suffix}`
}

export function moneyNameKey(name: string) {
  return playerSlug(name)
}

export function linkMoneyHistory(
  file: MoneyHistoryFile,
  roster: Array<{ entryId: string; name: string }>,
): LinkedMoneySeason[] {
  const slugs = roster.map((entry) => ({
    ...entry,
    slug: playerSlug(entry.name),
  }))
  const seasons = [...file.seasons].sort((left, right) => right.seasonYear - left.seasonYear)
  return seasons.map((season) => ({
    seasonYear: season.seasonYear,
    places: [...season.places]
      .sort((left, right) => left.place - right.place)
      .map((row) => {
        const key = moneyNameKey(row.name)
        const match = slugs.find((entry) => entry.slug === key)
        return {
          ...row,
          entryId: match?.entryId ?? null,
          slug: match?.slug ?? null,
        }
      }),
  }))
}

export function moneyFinishesForSlug(
  seasons: LinkedMoneySeason[],
  slug: string | null | undefined,
) {
  if (!slug) return []
  return seasons.flatMap((season) =>
    season.places
      .filter((row) => row.slug === slug)
      .map((row) => ({
        seasonYear: season.seasonYear,
        place: row.place,
        score: row.score,
      })),
  )
}
