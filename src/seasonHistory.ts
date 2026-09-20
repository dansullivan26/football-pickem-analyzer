export type HistoricalPeriod = {
  id: string
  description: string
  order: number
}

export type HistoricalWeeklyWin = {
  poolPeriodId: string
  week: number
  wins: number
  weeklyLeader: boolean
}

export type HistoricalStanding = {
  name: string
  entryId: string
  seasonScore: number
  rank: number
  weeklyWins: HistoricalWeeklyWin[]
}

export type HistoricalSeason = {
  seasonYear: number
  poolId: string
  seasonId: string | null
  periods: HistoricalPeriod[]
  standings: HistoricalStanding[]
}

export type SeasonHistoryFile = {
  source: {
    site: string
    fetchedAt: string
    timezone: string
  }
  poolFamily: {
    currentPoolId: string
    editions: Array<{
      seasonYear: number
      poolId: string
      seasonId: string | null
    }>
  }
  seasons: HistoricalSeason[]
}

type JsonRow = Record<string, unknown>

function row(value: unknown, label: string): JsonRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as JsonRow
}

function array(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`)
  return value
}

function text(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`)
  }
  return value.trim()
}

function nullableText(value: unknown, label: string) {
  return value == null ? null : text(value, label)
}

function integer(value: unknown, label: string, minimum = 0) {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`)
  }
  return value as number
}

function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicates.`)
  }
}

function sanitizePeriods(value: unknown, seasonYear: number) {
  const periods = array(value, `${seasonYear}.periods`).map((item, index) => {
    const period = row(item, `${seasonYear}.periods[${index}]`)
    return {
      id: text(period.id, `${seasonYear}.periods[${index}].id`),
      description: text(
        period.description,
        `${seasonYear}.periods[${index}].description`,
      ),
      order: integer(
        period.order,
        `${seasonYear}.periods[${index}].order`,
        1,
      ),
    }
  })
  unique(
    periods.map((period) => period.id),
    `${seasonYear}.period ids`,
  )
  unique(
    periods.map((period) => String(period.order)),
    `${seasonYear}.period orders`,
  )
  return periods.sort((left, right) => left.order - right.order)
}

function sanitizeWeeklyWins(
  value: unknown,
  seasonYear: number,
  name: string,
  periods: HistoricalPeriod[],
) {
  // CBS may expose only season totals for older editions such as 2023.
  if (value == null) return []
  const periodById = new Map(periods.map((period) => [period.id, period]))
  const weeklyWins = array(
    value,
    `${seasonYear}.${name}.weeklyWins`,
  ).map((item, index) => {
    const weekly = row(item, `${seasonYear}.${name}.weeklyWins[${index}]`)
    const poolPeriodId = text(
      weekly.poolPeriodId,
      `${seasonYear}.${name}.weeklyWins[${index}].poolPeriodId`,
    )
    const period = periodById.get(poolPeriodId)
    if (!period) {
      throw new Error(
        `${seasonYear}.${name}.weeklyWins[${index}] references unknown period ${poolPeriodId}.`,
      )
    }
    const week = integer(
      weekly.week,
      `${seasonYear}.${name}.weeklyWins[${index}].week`,
      1,
    )
    if (week !== period.order) {
      throw new Error(
        `${seasonYear}.${name}.weeklyWins[${index}] week ${week} does not match period order ${period.order}.`,
      )
    }
    if (typeof weekly.weeklyLeader !== 'boolean') {
      throw new Error(
        `${seasonYear}.${name}.weeklyWins[${index}].weeklyLeader must be a boolean.`,
      )
    }
    return {
      poolPeriodId,
      week,
      wins: integer(
        weekly.wins,
        `${seasonYear}.${name}.weeklyWins[${index}].wins`,
      ),
      weeklyLeader: weekly.weeklyLeader,
    }
  })
  unique(
    weeklyWins.map((weekly) => weekly.poolPeriodId),
    `${seasonYear}.${name}.weeklyWins periods`,
  )
  return weeklyWins.sort((left, right) => left.week - right.week)
}

export function sanitizeSeasonHistory(value: unknown): SeasonHistoryFile {
  const root = row(value, 'history')
  const source = row(root.source, 'source')
  const poolFamily = row(root.poolFamily, 'poolFamily')
  const currentPoolId = text(
    poolFamily.currentPoolId,
    'poolFamily.currentPoolId',
  )
  const editions = array(poolFamily.editions, 'poolFamily.editions').map(
    (item, index) => {
      const edition = row(item, `poolFamily.editions[${index}]`)
      return {
        seasonYear: integer(
          edition.seasonYear,
          `poolFamily.editions[${index}].seasonYear`,
          2000,
        ),
        poolId: text(
          edition.poolId,
          `poolFamily.editions[${index}].poolId`,
        ),
        seasonId: nullableText(
          edition.seasonId,
          `poolFamily.editions[${index}].seasonId`,
        ),
      }
    },
  )
  unique(
    editions.map((edition) => String(edition.seasonYear)),
    'poolFamily edition years',
  )

  const seasons = array(root.seasons, 'seasons').map((item, seasonIndex) => {
    const season = row(item, `seasons[${seasonIndex}]`)
    const seasonYear = integer(
      season.seasonYear,
      `seasons[${seasonIndex}].seasonYear`,
      2000,
    )
    const poolId = text(season.poolId, `${seasonYear}.poolId`)
    const edition = editions.find((candidate) => candidate.seasonYear === seasonYear)
    if (!edition || edition.poolId !== poolId) {
      throw new Error(
        `${seasonYear} must match one poolFamily.editions entry.`,
      )
    }
    const seasonId = nullableText(season.seasonId, `${seasonYear}.seasonId`)
    if (edition.seasonId !== seasonId) {
      throw new Error(
        `${seasonYear} seasonId must match its poolFamily.editions entry.`,
      )
    }
    const periods = sanitizePeriods(season.periods ?? [], seasonYear)
    const standings = array(
      season.standings,
      `${seasonYear}.standings`,
    ).map((item, standingIndex) => {
      const standing = row(
        item,
        `${seasonYear}.standings[${standingIndex}]`,
      )
      const name = text(
        standing.name,
        `${seasonYear}.standings[${standingIndex}].name`,
      )
      const sanitized = {
        name,
        entryId: text(
          standing.entryId,
          `${seasonYear}.${name}.entryId`,
        ),
        seasonScore: integer(
          standing.seasonScore,
          `${seasonYear}.${name}.seasonScore`,
        ),
        rank: integer(standing.rank, `${seasonYear}.${name}.rank`, 1),
        weeklyWins: sanitizeWeeklyWins(
          standing.weeklyWins,
          seasonYear,
          name,
          periods,
        ),
      }
      if (
        periods.length > 0 &&
        sanitized.weeklyWins.length === periods.length &&
        sanitized.weeklyWins.reduce((sum, weekly) => sum + weekly.wins, 0) !==
          sanitized.seasonScore
      ) {
        throw new Error(
          `${seasonYear}.${name} weekly wins do not sum to seasonScore.`,
        )
      }
      return sanitized
    })
    unique(
      standings.map((standing) => standing.entryId),
      `${seasonYear} entryIds`,
    )
    unique(
      standings.map((standing) => standing.name),
      `${seasonYear} display names`,
    )
    return {
      seasonYear,
      poolId,
      seasonId,
      periods,
      standings: standings.sort(
        (left, right) =>
          left.rank - right.rank ||
          right.seasonScore - left.seasonScore ||
          left.name.localeCompare(right.name),
      ),
    }
  })
  unique(
    seasons.map((season) => String(season.seasonYear)),
    'season years',
  )

  return {
    source: {
      site: text(source.site, 'source.site'),
      fetchedAt: text(source.fetchedAt, 'source.fetchedAt'),
      timezone: text(source.timezone, 'source.timezone'),
    },
    poolFamily: {
      currentPoolId,
      editions: editions.sort(
        (left, right) => right.seasonYear - left.seasonYear,
      ),
    },
    seasons: seasons.sort(
      (left, right) => right.seasonYear - left.seasonYear,
    ),
  }
}
