export function cbsTeamRank(
  team: { rank?: number | null } | null | undefined,
): number | null {
  return typeof team?.rank === 'number' ? team.rank : null
}

export function frozenRanksCaptured(
  game: { awayRank?: number | null; homeRank?: number | null },
) {
  return Object.hasOwn(game, 'awayRank') || Object.hasOwn(game, 'homeRank')
}

/** Stamp CBS ranks from the live slate. After kickoff, keep the first stamp. */
export function attachFrozenRanks<
  T extends { awayRank?: number | null; homeRank?: number | null },
>(
  frozen: T,
  game: { away?: { rank?: number | null }; home?: { rank?: number | null } },
  locked = false,
): T {
  if (locked && frozenRanksCaptured(frozen)) return frozen
  const awayRank = cbsTeamRank(game.away)
  const homeRank = cbsTeamRank(game.home)
  if (frozen.awayRank === awayRank && frozen.homeRank === homeRank) {
    return frozen
  }
  return { ...frozen, awayRank, homeRank }
}

export function teamWasRanked(ranks: Array<number | null | undefined>) {
  return ranks.some((rank) => typeof rank === 'number')
}

export function formatRankStamp(
  rank: number | null | undefined,
  includeUnranked = false,
) {
  if (typeof rank === 'number') return `#${rank}`
  if (rank === null && includeUnranked) return 'unranked'
  return null
}

export function formatRankTrail(
  ranks: Array<number | null | undefined>,
) {
  const includeUnranked = teamWasRanked(ranks)
  const stamps = ranks
    .map((rank) => formatRankStamp(rank, includeUnranked))
    .filter((stamp): stamp is string => stamp != null)
  if (stamps.length === 0) return null
  return stamps.join(' → ')
}
