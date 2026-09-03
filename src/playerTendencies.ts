import { sameSeasonWeek } from './careerHistory.ts'
import {
  REST_SPLIT_KEYS,
  REST_SPLIT_NOUNS,
  TRAVEL_SPLIT_KEYS,
  TRAVEL_SPLIT_NOUNS,
  restSplitKey,
  travelSplitKey,
  type AppearanceTravelRest,
  type RestSplitKey,
  type TravelSplitKey,
} from './travelRest.ts'
import type { PlayerWeek, RecommendationWeek } from './types'

export const PLAYER_LINE_TIERS = ['lock', 'hammer', 'lean', 'slight'] as const
export const PLAYER_TIER_KEYS = [...PLAYER_LINE_TIERS, 'neutral'] as const

export type PlayerTierKey = (typeof PLAYER_TIER_KEYS)[number]

export const PLAYER_TIER_LABELS: Record<PlayerTierKey, string> = {
  lock: 'Locks',
  hammer: 'Hammers',
  lean: 'Leans',
  slight: 'Slights',
  neutral: 'Neutral',
}

export type PlayerRateStat = {
  hits: number
  eligible: number
  rate: string
  detail: string
}

export type PlayerTendencySummary = {
  made: number
  scored: number
  homeRate: string
  favoriteRate: string
  winRate: string
  lineValueRate: string
  lineValueDetail: string
  tiebreakerRate: string
  tiebreakerDetail: string
  tiers: Record<PlayerTierKey, PlayerRateStat>
  travel: Record<TravelSplitKey, PlayerRateStat>
  rest: Record<RestSplitKey, PlayerRateStat>
}

function formatRate(hits: number, eligible: number) {
  if (!eligible) return '—'
  return `${Math.round((hits / eligible) * 100)}%`
}

function emptyTierCounts(): Record<
  PlayerTierKey,
  { hits: number; eligible: number }
> {
  return {
    lock: { hits: 0, eligible: 0 },
    hammer: { hits: 0, eligible: 0 },
    lean: { hits: 0, eligible: 0 },
    slight: { hits: 0, eligible: 0 },
    neutral: { hits: 0, eligible: 0 },
  }
}

function emptyFactorCounts<K extends string>(
  keys: readonly K[],
): Record<K, { hits: number; eligible: number }> {
  return Object.fromEntries(
    keys.map((key) => [key, { hits: 0, eligible: 0 }]),
  ) as Record<K, { hits: number; eligible: number }>
}

function tallyFactor<K extends string>(
  counts: Record<K, { hits: number; eligible: number }>,
  key: K | null,
  hit: boolean,
) {
  if (!key) return
  counts[key].eligible += 1
  if (hit) counts[key].hits += 1
}

function tierStat(
  key: PlayerTierKey,
  hits: number,
  eligible: number,
): PlayerRateStat {
  if (!eligible) {
    return {
      hits,
      eligible,
      rate: '—',
      detail:
        key === 'neutral'
          ? 'No overlapping neutrals yet'
          : `No overlapping ${PLAYER_TIER_LABELS[key].toLowerCase()} yet`,
    }
  }
  if (key === 'neutral') {
    return {
      hits,
      eligible,
      rate: formatRate(hits, eligible),
      detail: `${hits} of ${eligible} home picks · no line-value edge`,
    }
  }
  return {
    hits,
    eligible,
    rate: formatRate(hits, eligible),
    detail: `${hits} of ${eligible} ${PLAYER_TIER_LABELS[key].toLowerCase()}`,
  }
}

function factorStat(
  noun: string,
  hits: number,
  eligible: number,
): PlayerRateStat {
  if (!eligible) {
    return {
      hits,
      eligible,
      rate: '—',
      detail: `No overlapping ${noun} yet`,
    }
  }
  return {
    hits,
    eligible,
    rate: formatRate(hits, eligible),
    detail: `${hits} of ${eligible} ${noun}`,
  }
}

export function summarizePlayer(
  entryId: string,
  weeks: PlayerWeek[],
  recWeeks: RecommendationWeek[],
  fallbackSeason: number,
  travelRestByAppearance?: Map<string, AppearanceTravelRest>,
): PlayerTendencySummary {
  const picks = weeks.flatMap(
    (week) =>
      week.entries.find((entry) => entry.entryId === entryId)?.picks ?? [],
  )
  const made = picks.filter((pick) => pick.pickedSide)
  const scored = made.filter((pick) => pick.result)
  const home = made.filter((pick) => pick.pickedSide === 'home')
  const favorites = made.filter(
    (pick) =>
      (pick.homeSpread < 0 && pick.pickedSide === 'home') ||
      (pick.homeSpread > 0 && pick.pickedSide === 'away'),
  )
  const wins = scored.filter((pick) => pick.result === 'win')

  const percent = (count: number) =>
    made.length ? `${Math.round((count / made.length) * 100)}%` : '—'

  let lineValueEligible = 0
  let lineValueHits = 0
  let tiebreakerEligible = 0
  let tiebreakerNear = 0
  const tierCounts = emptyTierCounts()
  const travelCounts = emptyFactorCounts(TRAVEL_SPLIT_KEYS)
  const restCounts = emptyFactorCounts(REST_SPLIT_KEYS)

  for (const recWeek of recWeeks) {
    const entry = weeks
      .find((week) => sameSeasonWeek(week, recWeek, fallbackSeason))
      ?.entries.find((row) => row.entryId === entryId)
    if (!entry) continue

    const picksByEvent = new Map(
      entry.picks.map((pick) => [pick.cbsEventId, pick]),
    )
    for (const game of recWeek.games) {
      const pick = picksByEvent.get(game.cbsEventId)
      if (!pick?.pickedSide) continue

      if (travelRestByAppearance) {
        for (const side of ['away', 'home'] as const) {
          const ctx = travelRestByAppearance.get(`${game.cbsEventId}:${side}`)
          const tookSide = pick.pickedSide === side
          tallyFactor(travelCounts, travelSplitKey(ctx?.travel), tookSide)
          tallyFactor(restCounts, restSplitKey(ctx?.rest), tookSide)
        }
      }

      const benefitingSide =
        game.source === 'line-value' ? game.recommendedSide : null
      if (benefitingSide) {
        lineValueEligible += 1
        if (pick.pickedSide === benefitingSide) lineValueHits += 1
      }

      if (game.category === 'neutral') {
        tierCounts.neutral.eligible += 1
        if (pick.pickedSide === 'home') tierCounts.neutral.hits += 1
        continue
      }

      if (
        (game.category === 'lock' ||
          game.category === 'hammer' ||
          game.category === 'lean' ||
          game.category === 'slight') &&
        game.recommendedSide
      ) {
        const bucket = tierCounts[game.category]
        bucket.eligible += 1
        if (pick.pickedSide === game.recommendedSide) bucket.hits += 1
      }
    }

    const total = recWeek.tiebreaker?.draftKingsTotal
    const answer = entry.tiebreaker?.answer
    if (typeof total !== 'number' || typeof answer !== 'number') continue
    tiebreakerEligible += 1
    if (Math.abs(answer - total) <= 2) tiebreakerNear += 1
  }

  return {
    made: made.length,
    scored: scored.length,
    homeRate: percent(home.length),
    favoriteRate: percent(favorites.length),
    winRate: scored.length
      ? `${Math.round((wins.length / scored.length) * 100)}%`
      : '—',
    lineValueRate: formatRate(lineValueHits, lineValueEligible),
    lineValueDetail: lineValueEligible
      ? `${lineValueHits} of ${lineValueEligible} line-value games`
      : 'No overlapping line-value picks yet',
    tiebreakerRate: formatRate(tiebreakerNear, tiebreakerEligible),
    tiebreakerDetail: tiebreakerEligible
      ? `${tiebreakerNear} of ${tiebreakerEligible} within 2 of the frozen O/U`
      : 'No freeze-time totals and answers yet',
    tiers: Object.fromEntries(
      PLAYER_TIER_KEYS.map((key) => [
        key,
        tierStat(key, tierCounts[key].hits, tierCounts[key].eligible),
      ]),
    ) as Record<PlayerTierKey, PlayerRateStat>,
    travel: Object.fromEntries(
      TRAVEL_SPLIT_KEYS.map((key) => [
        key,
        factorStat(
          TRAVEL_SPLIT_NOUNS[key],
          travelCounts[key].hits,
          travelCounts[key].eligible,
        ),
      ]),
    ) as Record<TravelSplitKey, PlayerRateStat>,
    rest: Object.fromEntries(
      REST_SPLIT_KEYS.map((key) => [
        key,
        factorStat(
          REST_SPLIT_NOUNS[key],
          restCounts[key].hits,
          restCounts[key].eligible,
        ),
      ]),
    ) as Record<RestSplitKey, PlayerRateStat>,
  }
}
