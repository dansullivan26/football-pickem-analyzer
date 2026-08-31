import type { TeamAppearance, TeamRecord } from './teamPerformance.ts'

/** Overall book size before a label. Same floor as a split so a loud 4-0 / 3-1 can profile. CBS NCAAF teams rarely appear six times; 3-0 is still too thin with the prior. */
export const TEAM_PROFILE_MIN_DECIDED = 4
export const TEAM_SPLIT_MIN_DECIDED = 4
export const TEAM_SPLIT_MIN_RATE = 0.7
export const TEAM_INSIGHT_MIN_DECIDED = 4
export const TEAM_INSIGHT_MIN_RATE = 0.7
export const TEAM_PROFILE_PRIOR = 4

export type TeamProfileKey =
  | 'overall'
  | 'home'
  | 'away'
  | 'favorite'
  | 'dog'
  | 'benign'
  | 'adverse'
  | 'wet'
  | 'windy'
  | 'indoor'

export type TeamProfile = {
  archetype: string
  archetypeDetail: string
  insight: string | null
  decided: number
}

type SplitDef = {
  key: TeamProfileKey
  coverLabel: string
  fadeLabel: string
  coverPhrase: string
  fadePhrase: string
  detailNoun: string
  match: (row: TeamAppearance) => boolean
}

type Candidate = {
  key: TeamProfileKey
  label: string
  detail: string
  insight: string
  covers: boolean
  decided: number
  directionalRate: number
  strength: number
  events: number[]
}

const SPLITS: SplitDef[] = [
  {
    key: 'overall',
    coverLabel: 'Covers ATS',
    fadeLabel: 'Struggles ATS',
    coverPhrase: 'ATS',
    fadePhrase: 'ATS',
    detailNoun: 'graded',
    match: () => true,
  },
  {
    key: 'home',
    coverLabel: 'Covers at home',
    fadeLabel: 'Struggles at home',
    coverPhrase: 'at home',
    fadePhrase: 'at home',
    detailNoun: 'home',
    match: (row) => row.venue === 'home',
  },
  {
    key: 'away',
    coverLabel: 'Covers on the road',
    fadeLabel: 'Struggles on the road',
    coverPhrase: 'on the road',
    fadePhrase: 'on the road',
    detailNoun: 'road',
    match: (row) => row.venue === 'away',
  },
  {
    key: 'favorite',
    coverLabel: 'Covers as a favorite',
    fadeLabel: 'Struggles as a favorite',
    coverPhrase: 'as a favorite',
    fadePhrase: 'as a favorite',
    detailNoun: 'favorite',
    match: (row) => row.market === 'favorite',
  },
  {
    key: 'dog',
    coverLabel: 'Covers as a dog',
    fadeLabel: 'Struggles as a dog',
    coverPhrase: 'as a dog',
    fadePhrase: 'as a dog',
    detailNoun: 'dog',
    match: (row) => row.market === 'dog',
  },
  {
    key: 'benign',
    coverLabel: 'Covers in fair weather',
    fadeLabel: 'Struggles in fair weather',
    coverPhrase: 'in fair weather',
    fadePhrase: 'in fair weather',
    detailNoun: 'fair-weather',
    match: (row) => row.weather?.bucket === 'benign',
  },
  {
    key: 'adverse',
    coverLabel: 'Covers in bad weather',
    fadeLabel: 'Struggles in bad weather',
    coverPhrase: 'in adverse weather',
    fadePhrase: 'in adverse weather',
    detailNoun: 'adverse-weather',
    match: (row) => row.weather?.bucket === 'adverse',
  },
  {
    key: 'wet',
    coverLabel: 'Covers in the wet',
    fadeLabel: 'Struggles in the wet',
    coverPhrase: 'in the wet',
    fadePhrase: 'in the wet',
    detailNoun: 'wet',
    match: (row) => row.weather?.wet === true,
  },
  {
    key: 'windy',
    coverLabel: 'Covers in the wind',
    fadeLabel: 'Struggles in the wind',
    coverPhrase: 'in the wind',
    fadePhrase: 'in the wind',
    detailNoun: 'windy',
    match: (row) => row.weather?.windy === true,
  },
  {
    key: 'indoor',
    coverLabel: 'Covers indoors',
    fadeLabel: 'Struggles indoors',
    coverPhrase: 'indoors',
    fadePhrase: 'indoors',
    detailNoun: 'indoor',
    match: (row) => row.weather?.bucket === 'indoor',
  },
]

const WEATHER_RELATED: ReadonlySet<TeamProfileKey> = new Set([
  'adverse',
  'wet',
  'windy',
])

function decidedRows(
  appearances: TeamAppearance[],
  match: (row: TeamAppearance) => boolean,
) {
  return appearances.filter(
    (row) =>
      (row.result === 'win' || row.result === 'loss') && match(row),
  )
}

function sameEventSet(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) return false
  const ids = new Set(left)
  return right.every((id) => ids.has(id))
}

function redundantInsight(first: Candidate, next: Candidate) {
  if (first.key === next.key) return true
  if (next.key === 'overall') return true
  if (sameEventSet(first.events, next.events)) return true
  return WEATHER_RELATED.has(first.key) && WEATHER_RELATED.has(next.key)
}

function insightFor(
  split: SplitDef,
  covers: boolean,
  hits: number,
  decided: number,
) {
  const phrase = covers ? split.coverPhrase : split.fadePhrase
  const verb = covers ? 'Has covered' : 'Has not covered'
  return `${verb} ${phrase} in ${hits} of ${decided} graded games.`
}

function candidateFor(
  split: SplitDef,
  appearances: TeamAppearance[],
): Candidate | null {
  const rows = decidedRows(appearances, split.match)
  const decided = rows.length
  if (decided < TEAM_SPLIT_MIN_DECIDED) return null

  const wins = rows.filter((row) => row.result === 'win').length
  const losses = decided - wins
  const rate = wins / decided
  const directionalRate = Math.max(rate, 1 - rate)
  if (directionalRate < TEAM_SPLIT_MIN_RATE) return null

  const covers = rate >= 0.5
  const hits = covers ? wins : losses
  const posteriorRate =
    (hits + TEAM_PROFILE_PRIOR / 2) / (decided + TEAM_PROFILE_PRIOR)
  return {
    key: split.key,
    label: covers ? split.coverLabel : split.fadeLabel,
    detail: `${Math.round(directionalRate * 100)}% ATS across ${decided} ${split.detailNoun} games`,
    insight: insightFor(split, covers, hits, decided),
    covers,
    decided,
    directionalRate,
    strength:
      Math.max(0, (posteriorRate - 0.5) * 2) *
      Math.min(1, decided / TEAM_PROFILE_MIN_DECIDED),
    events: rows.map((row) => row.cbsEventId),
  }
}

function profileInsight(ranked: Candidate[]) {
  const [first, ...rest] = ranked
  if (!first) return null
  for (const candidate of rest) {
    if (redundantInsight(first, candidate)) continue
    if (
      candidate.decided < TEAM_INSIGHT_MIN_DECIDED ||
      candidate.directionalRate < TEAM_INSIGHT_MIN_RATE
    ) {
      continue
    }
    return candidate.insight
  }
  return null
}

export function buildTeamProfile(team: Pick<TeamRecord, 'appearances'>): TeamProfile {
  const decided = decidedRows(team.appearances, () => true).length
  const candidates = SPLITS.map((split) =>
    candidateFor(split, team.appearances),
  ).filter((row): row is Candidate => row != null)

  if (decided < TEAM_PROFILE_MIN_DECIDED) {
    return {
      archetype: 'Building profile',
      archetypeDetail: `${decided} graded game${
        decided === 1 ? '' : 's'
      }; ${TEAM_PROFILE_MIN_DECIDED} are needed before assigning a style`,
      insight: null,
      decided,
    }
  }

  const ranked = [...candidates].sort((left, right) => {
    if (right.strength !== left.strength) return right.strength - left.strength
    if (left.covers !== right.covers) return left.covers ? -1 : 1
    if (left.key === 'overall') return 1
    if (right.key === 'overall') return -1
    return left.key.localeCompare(right.key)
  })
  const strongest = ranked[0]
  return {
    archetype: strongest?.label ?? 'No dominant pattern',
    archetypeDetail:
      strongest?.detail ??
      `${decided} graded games, but no split is strong enough to label`,
    insight: profileInsight(ranked),
    decided,
  }
}
