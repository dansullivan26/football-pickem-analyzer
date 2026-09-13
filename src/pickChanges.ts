import type {
  PickChange,
  PickChangeSides,
  PickChangeType,
} from './types.ts'

const CHANGE_TYPES = new Set<PickChangeType>(['appeared', 'flipped', 'cleared'])

function readIso(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be an ISO timestamp.`)
  }
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${label} is not a valid timestamp.`)
  }
  return value
}

function readIsoOrNull(value: unknown, label: string) {
  if (value == null) return null
  return readIso(value, label)
}

function readSide(value: unknown, label: string): PickChangeSides {
  const row =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const pickedSide = row.pickedSide ?? null
  if (pickedSide != null && pickedSide !== 'home' && pickedSide !== 'away') {
    throw new Error(`${label}.pickedSide must be home, away, or null.`)
  }
  return {
    pickedSide,
    pickedTeamId: typeof row.pickedTeamId === 'string' ? row.pickedTeamId : null,
    pickedTeam: typeof row.pickedTeam === 'string' ? row.pickedTeam : null,
  }
}

export function readFirstSeenAt(value: unknown) {
  return readIsoOrNull(value, 'firstSeenAt')
}

/**
 * Strip GrokBot-only paths and flatten this dump's deltas into log rows.
 * `previousSnapshot` never belongs in the public repo.
 */
export function sanitizePickChanges(
  raw: unknown,
  fallbackFetchedAt: string | null,
): PickChange[] {
  if (raw == null) return []
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('pickChanges must be an object or omitted.')
  }

  const block = raw as {
    week?: unknown
    periodId?: unknown
    previousFetchedAt?: unknown
    fetchedAt?: unknown
    changes?: unknown
  }
  if (!Number.isInteger(block.week)) {
    throw new Error('pickChanges.week must be an integer.')
  }
  const week = block.week as number
  const periodId =
    typeof block.periodId === 'string' && block.periodId.trim()
      ? block.periodId.trim()
      : ''
  const fetchedAt = readIso(
    block.fetchedAt ?? fallbackFetchedAt,
    'pickChanges.fetchedAt',
  )
  const previousFetchedAt = readIsoOrNull(
    block.previousFetchedAt,
    'pickChanges.previousFetchedAt',
  )
  const rows = Array.isArray(block.changes) ? block.changes : []

  return rows.map((row, index) => {
    const change = row as Partial<PickChange> & { window?: Partial<PickChange['window']> }
    const label = `pickChanges.changes[${index}]`
    if (typeof change.entryId !== 'string' || !change.entryId) {
      throw new Error(`${label} is missing entryId.`)
    }
    if (typeof change.gameId !== 'string' || !change.gameId) {
      throw new Error(`${label} is missing gameId.`)
    }
    if (!CHANGE_TYPES.has(change.changeType as PickChangeType)) {
      throw new Error(`${label} has an invalid changeType.`)
    }
    const windowAfter = readIsoOrNull(
      change.window?.after ?? previousFetchedAt,
      `${label}.window.after`,
    )
    const windowAt = readIso(
      change.window?.atOrBefore ?? fetchedAt,
      `${label}.window.atOrBefore`,
    )
    return {
      week,
      periodId,
      entryId: change.entryId,
      name: typeof change.name === 'string' ? change.name : '',
      gameId: change.gameId,
      cbsEventId:
        typeof change.cbsEventId === 'number' ? change.cbsEventId : 0,
      away: typeof change.away === 'string' ? change.away : '',
      home: typeof change.home === 'string' ? change.home : '',
      changeType: change.changeType as PickChangeType,
      from: readSide(change.from, `${label}.from`),
      to: readSide(change.to, `${label}.to`),
      firstSeenAt: readIsoOrNull(change.firstSeenAt, `${label}.firstSeenAt`),
      previousFetchedAt,
      fetchedAt,
      window: { after: windowAfter, atOrBefore: windowAt },
    }
  })
}

/** Re-ingesting the same dump replaces that dump's slice instead of duplicating. */
export function mergePickChangeLog(
  existing: PickChange[] | undefined,
  incoming: PickChange[],
) {
  if (incoming.length === 0) return existing ?? []
  const dumpKeys = new Set(
    incoming.map((row) => `${row.week}|${row.fetchedAt}`),
  )
  const kept = (existing ?? []).filter(
    (row) => !dumpKeys.has(`${row.week}|${row.fetchedAt}`),
  )
  return [...kept, ...incoming]
}

export function pickChangeForGame(
  log: PickChange[] | undefined,
  entryId: string,
  gameId: string,
) {
  const matches = (log ?? []).filter(
    (row) => row.entryId === entryId && row.gameId === gameId,
  )
  return matches.at(-1) ?? null
}
