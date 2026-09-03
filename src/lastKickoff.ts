import type { Slate, Team } from './types'

export type LastKickoffSource = 'cfbd' | 'nflverse'

export type LastKickoffRow = {
  key: string
  lastKickoff: string
  source: LastKickoffSource
  label?: string
}

export type LastKickoffFile = {
  updatedAt: string | null
  seasonYear: number
  teams: LastKickoffRow[]
}

export type ScheduleRosterTeam = {
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  location?: string | null
  name?: string | null
}

const SAME_GAME_MS = 8 * 60 * 60 * 1000

/** CBS abbrev → CFBD school name when location/name will not match. */
export const CFBD_SCHOOL_BY_ABBREV: Record<string, string> = {
  UNC: 'North Carolina',
  STNFRD: 'Stanford',
  GATECH: 'Georgia Tech',
  MICHST: 'Michigan State',
  MIAMI: 'Miami',
  CSTCAR: 'Coastal Carolina',
  BAMA: 'Alabama',
  MIAOH: 'Miami (OH)',
  CINCY: 'Cincinnati',
  CHARLO: 'Charlotte',
  MRSHL: 'Marshall',
  PSU: 'Penn State',
  OKLAST: 'Oklahoma State',
  COLOST: 'Colorado State',
  ARKST: 'Arkansas State',
  MEMP: 'Memphis',
  IDST: 'Idaho State',
  UTAHST: 'Utah State',
  WMICH: 'Western Michigan',
  CMICH: 'Central Michigan',
  NMEX: 'New Mexico',
  WASHST: 'Washington State',
  LVILLE: 'Louisville',
  MISS: 'Ole Miss',
  WISC: 'Wisconsin',
  CIT: 'The Citadel',
  HAWAII: "Hawai'i",
  ND: 'Notre Dame',
}

/** CBS NFL abbrev → nflverse team code. */
export const NFLVERSE_ABBREV_BY_CBS: Record<string, string> = {
  WAS: 'WAS',
  WSH: 'WAS',
  LAR: 'LA',
  LA: 'LA',
  LAC: 'LAC',
  JAC: 'JAX',
  JAX: 'JAX',
  ARZ: 'ARI',
  ARI: 'ARI',
  GB: 'GB',
  LV: 'LV',
  OAK: 'LV',
  SD: 'LAC',
}

export function emptyLastKickoff(seasonYear: number): LastKickoffFile {
  return { updatedAt: null, seasonYear, teams: [] }
}

export function lastKickoffByKey(
  file: LastKickoffFile | null | undefined,
): Map<string, LastKickoffRow> {
  return new Map((file?.teams ?? []).map((row) => [row.key, row]))
}

export function normalizeScheduleName(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function rosterFromSlate(slate: Slate): ScheduleRosterTeam[] {
  const seen = new Map<string, ScheduleRosterTeam>()
  for (const game of slate.games) {
    for (const side of [game.away, game.home] as Team[]) {
      const key = `${game.sport}:${side.abbrev}`
      if (seen.has(key)) continue
      seen.set(key, {
        sport: game.sport,
        abbrev: side.abbrev,
        location: side.location,
        name: side.name,
      })
    }
  }
  return [...seen.values()]
}

function teamNames(team: ScheduleRosterTeam) {
  return [team.location, team.name, team.abbrev].filter(
    (value): value is string => Boolean(value?.trim()),
  )
}

export function matchCfbdSchool(
  team: ScheduleRosterTeam,
  schools: string[],
) {
  const alias = CFBD_SCHOOL_BY_ABBREV[team.abbrev]
  const aliasNorm = alias ? normalizeScheduleName(alias) : null
  const ours = teamNames(team).map(normalizeScheduleName)
  let found: string | null = null
  for (const school of schools) {
    const theirs = normalizeScheduleName(school)
    if (!theirs) continue
    if (aliasNorm && theirs === aliasNorm) return school
    if (ours.includes(theirs)) {
      if (found && found !== school) return null
      found = school
    }
  }
  return found
}

export function matchNflverseAbbrev(
  team: ScheduleRosterTeam,
  abbrevs: string[],
) {
  const mapped = NFLVERSE_ABBREV_BY_CBS[team.abbrev] ?? team.abbrev
  if (abbrevs.includes(mapped)) return mapped
  const ours = normalizeScheduleName(team.abbrev)
  const byName = abbrevs.find((abbrev) => normalizeScheduleName(abbrev) === ours)
  return byName ?? null
}

export function laterIso(left: string | null | undefined, right: string | null | undefined) {
  if (!left) return right ?? null
  if (!right) return left
  return left > right ? left : right
}

/** Schedule kickoff that is clearly before this card game, not the same kickoff. */
export function scheduleKickoffBefore(
  lastKickoff: string | null | undefined,
  thisKickoff: string,
) {
  if (!lastKickoff) return null
  const previous = Date.parse(lastKickoff)
  const next = Date.parse(thisKickoff)
  if (Number.isNaN(previous) || Number.isNaN(next)) return null
  if (previous >= next - SAME_GAME_MS) return null
  return lastKickoff
}

export function mergePreviousKickoff(
  cardKickoff: string | null | undefined,
  scheduleKickoff: string | null | undefined,
) {
  return laterIso(cardKickoff ?? null, scheduleKickoff ?? null)
}

export function cfbdGameKickoff(game: Record<string, unknown>) {
  const raw = game.startDate ?? game.start_date
  return typeof raw === 'string' && raw.trim() ? raw : null
}

export function cfbdGameTeam(game: Record<string, unknown>, side: 'home' | 'away') {
  const camel = side === 'home' ? game.homeTeam : game.awayTeam
  const snake = side === 'home' ? game.home_team : game.away_team
  if (typeof camel === 'string') return camel
  if (typeof snake === 'string') return snake
  if (camel && typeof camel === 'object' && 'school' in camel) {
    const school = (camel as { school?: unknown }).school
    if (typeof school === 'string') return school
  }
  return null
}

export function lastKickoffsFromCfbdGames(
  games: Record<string, unknown>[],
  roster: ScheduleRosterTeam[],
  nowMs: number,
) {
  const schools = [
    ...new Set(
      games.flatMap((game) => [
        cfbdGameTeam(game, 'home'),
        cfbdGameTeam(game, 'away'),
      ]).filter((value): value is string => Boolean(value)),
    ),
  ]
  const rows: LastKickoffRow[] = []
  for (const team of roster.filter((row) => row.sport === 'NCAAF')) {
    const school = matchCfbdSchool(team, schools)
    if (!school) continue
    const schoolNorm = normalizeScheduleName(school)
    let last: string | null = null
    for (const game of games) {
      const kickoff = cfbdGameKickoff(game)
      if (!kickoff) continue
      const at = Date.parse(kickoff)
      if (Number.isNaN(at) || at > nowMs) continue
      const home = normalizeScheduleName(cfbdGameTeam(game, 'home'))
      const away = normalizeScheduleName(cfbdGameTeam(game, 'away'))
      if (home !== schoolNorm && away !== schoolNorm) continue
      last = laterIso(last, kickoff)
    }
    if (!last) continue
    rows.push({
      key: `NCAAF:${team.abbrev}`,
      lastKickoff: last,
      source: 'cfbd',
      label: school,
    })
  }
  return rows
}

export function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
  const header = lines[0]?.split(',') ?? []
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    const row: Record<string, string> = {}
    for (let i = 0; i < header.length; i += 1) {
      row[header[i] ?? ''] = cols[i] ?? ''
    }
    return row
  })
}

export function nflverseKickoff(gameday: string, gametime: string) {
  const day = gameday.trim()
  if (!day) return null
  const time = (gametime.trim() || '13:00').padEnd(5, ':00')
  const clock = time.length === 5 ? `${time}:00` : time
  return `${day}T${clock}-04:00`
}

const NFL_GAME_TYPES = new Set(['REG', 'WC', 'DIV', 'CON', 'SB'])

export function lastKickoffsFromNflverseCsv(
  csv: string,
  seasonYear: number,
  roster: ScheduleRosterTeam[],
  nowMs: number,
) {
  const games = parseCsv(csv).filter(
    (game) =>
      Number(game.season) === seasonYear && NFL_GAME_TYPES.has(game.game_type),
  )
  const abbrevs = [
    ...new Set(games.flatMap((game) => [game.home_team, game.away_team])),
  ]
  const rows: LastKickoffRow[] = []
  for (const team of roster.filter((row) => row.sport === 'NFL')) {
    const abbrev = matchNflverseAbbrev(team, abbrevs)
    if (!abbrev) continue
    let last: string | null = null
    for (const game of games) {
      if (game.home_team !== abbrev && game.away_team !== abbrev) continue
      const kickoff = nflverseKickoff(game.gameday, game.gametime)
      if (!kickoff) continue
      const at = Date.parse(kickoff)
      if (Number.isNaN(at) || at > nowMs) continue
      last = laterIso(last, kickoff)
    }
    if (!last) continue
    rows.push({
      key: `NFL:${team.abbrev}`,
      lastKickoff: last,
      source: 'nflverse',
      label: abbrev,
    })
  }
  return rows
}

export function mergeLastKickoffFiles(
  seasonYear: number,
  updatedAt: string,
  ...groups: LastKickoffRow[][]
): LastKickoffFile {
  const byKey = new Map<string, LastKickoffRow>()
  for (const row of groups.flat()) {
    const existing = byKey.get(row.key)
    if (!existing || (laterIso(existing.lastKickoff, row.lastKickoff) === row.lastKickoff)) {
      byKey.set(row.key, row)
    }
  }
  return {
    updatedAt,
    seasonYear,
    teams: [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
  }
}
