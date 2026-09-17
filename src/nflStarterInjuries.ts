export type NflAvailabilityTier =
  | 'out'
  | 'doubtful'
  | 'questionable'
  | 'reserve'

export type NflStarterInjury = {
  athleteId: string | null
  name: string
  position: string
  status: string
  tier: NflAvailabilityTier
  injury: string | null
  detail: string | null
  updatedAt: string | null
}

export type NflStarterInjuryTeam = {
  abbrev: string
  name: string
  espnTeamId: string
  depthChartAt: string | null
  status: 'ok' | 'unavailable'
  injuries: NflStarterInjury[]
}

export type NflStarterInjuryFile = {
  source: {
    provider: 'ESPN'
    fetchedAt: string
    reportUpdatedAt: string | null
    note: string
  }
  teams: NflStarterInjuryTeam[]
}

export const NFL_AVAILABILITY_LABELS: Record<NflAvailabilityTier, string> = {
  out: 'Out',
  doubtful: 'Doubtful',
  questionable: 'Questionable',
  reserve: 'Reserve lists',
}

export const NFL_AVAILABILITY_ORDER: NflAvailabilityTier[] = [
  'out',
  'doubtful',
  'questionable',
  'reserve',
]

type JsonRow = Record<string, unknown>

function row(value: unknown): JsonRow {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRow)
    : {}
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(row) : []
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function athleteIdFromLinks(value: unknown) {
  for (const link of rows(value)) {
    const href = text(link.href)
    const match = href?.match(/\/player\/_\/id\/(\d+)/)
    if (match?.[1]) return match[1]
  }
  return null
}

function athleteKey(id: string | null, name: string) {
  return id ? `id:${id}` : `name:${name.trim().toLowerCase()}`
}

export function nflAvailabilityTier(
  status: string,
): NflAvailabilityTier | null {
  const normalized = status.toLowerCase().replace(/[_-]+/g, ' ')
  if (
    normalized.includes('injured reserve') ||
    normalized === 'ir' ||
    normalized.includes('physically unable') ||
    normalized === 'pup' ||
    normalized.includes('non football injury') ||
    normalized === 'nfi' ||
    normalized.includes('reserve')
  ) {
    return 'reserve'
  }
  if (normalized.includes('doubtful')) return 'doubtful'
  if (normalized.includes('questionable')) return 'questionable'
  if (
    normalized === 'out' ||
    normalized.includes('inactive') ||
    normalized.includes('suspended')
  ) {
    return 'out'
  }
  return null
}

/**
 * ESPN does not mark `starter` directly in this feed. Within each listed
 * position, the first athlete is the current first-team player.
 */
export function firstTeamPlayersFromDepthChart(raw: unknown) {
  const root = row(raw)
  const starters = new Map<
    string,
    { athleteId: string | null; name: string; position: string }
  >()
  for (const formation of rows(root.depthchart)) {
    const positions = row(formation.positions)
    for (const positionValue of Object.values(positions)) {
      const position = row(positionValue)
      const first = rows(position.athletes)[0]
      if (!first) continue
      const name = text(first.displayName)
      if (!name) continue
      const id = text(first.id)
      const positionLabel =
        text(row(position.position).abbreviation) ??
        text(row(position.position).displayName) ??
        '—'
      const key = athleteKey(id, name)
      const existing = starters.get(key)
      starters.set(key, {
        athleteId: id,
        name,
        position:
          existing && existing.position !== positionLabel
            ? `${existing.position}/${positionLabel}`
            : positionLabel,
      })
    }
  }
  return starters
}

export function starterInjuriesForTeam(
  injuries: unknown[],
  depthChart: unknown,
) {
  const starters = firstTeamPlayersFromDepthChart(depthChart)
  const starterNames = new Map(
    [...starters.values()].map((starter) => [
      starter.name.trim().toLowerCase(),
      starter,
    ]),
  )
  const found = new Map<string, NflStarterInjury>()

  for (const injuryValue of injuries) {
    const injury = row(injuryValue)
    const athlete = row(injury.athlete)
    const name = text(athlete.displayName)
    if (!name) continue
    const id =
      text(athlete.id) ??
      athleteIdFromLinks(athlete.links)
    const starter =
      starters.get(athleteKey(id, name)) ??
      starterNames.get(name.toLowerCase())
    if (!starter) continue

    const status =
      text(injury.status) ??
      text(row(injury.type).description) ??
      text(row(injury.type).abbreviation)
    if (!status) continue
    const tier = nflAvailabilityTier(status)
    if (!tier) continue

    const entry: NflStarterInjury = {
      athleteId: id ?? starter.athleteId,
      name,
      position:
        text(row(athlete.position).abbreviation) ?? starter.position,
      status,
      tier,
      injury: text(row(injury.details).type),
      detail: text(injury.shortComment),
      updatedAt: text(injury.date),
    }
    const key = athleteKey(entry.athleteId, entry.name)
    const previous = found.get(key)
    if (
      !previous ||
      NFL_AVAILABILITY_ORDER.indexOf(entry.tier) <
        NFL_AVAILABILITY_ORDER.indexOf(previous.tier) ||
      (entry.updatedAt ?? '') > (previous.updatedAt ?? '')
    ) {
      found.set(key, entry)
    }
  }

  return [...found.values()].sort(
    (left, right) =>
      NFL_AVAILABILITY_ORDER.indexOf(left.tier) -
        NFL_AVAILABILITY_ORDER.indexOf(right.tier) ||
      left.position.localeCompare(right.position) ||
      left.name.localeCompare(right.name),
  )
}

export function injuriesByEspnTeam(raw: unknown) {
  const root = row(raw)
  return new Map(
    rows(root.injuries).map((team) => [
      text(team.id) ?? '',
      rows(team.injuries),
    ]),
  )
}

export function formatInjuryPulledAt(
  fetchedAt: string,
  timeZone = 'America/Indianapolis',
) {
  const date = new Date(fetchedAt)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}
