import { normalizeScheduleName } from './lastKickoff.ts'
import type { TeamRosterFile } from './teamRoster.ts'

export type BowlPickemStatus = 'awaiting-matchups' | 'open' | 'final'

export type BowlSide = {
  name: string
  abbrev: string | null
  teamId: string | null
}

export type BowlGame = {
  id: string
  providerEventId: string | null
  bowlName: string | null
  kickoff: string | null
  away: BowlSide
  home: BowlSide
  /** DraftKings home spread. Negative means the home side is favored. */
  homeSpread: number | null
  spreadUpdatedAt: string | null
}

export type BowlOptOutReason =
  | 'nfl-draft'
  | 'transfer-portal'
  | 'injury'
  | 'other'

export type BowlOptOut = {
  id: string
  team: string
  player: string
  position: string | null
  reason: BowlOptOutReason
  detail: string | null
  reportedAt: string | null
}

export type BowlStaffRole = 'head-coach' | 'coordinator' | 'other'
export type BowlStaffChangeKind = 'departed' | 'hired' | 'interim'

export type BowlStaffChange = {
  id: string
  team: string
  person: string
  role: BowlStaffRole
  change: BowlStaffChangeKind
  previousTeam: string | null
  destination: string | null
  reportedAt: string | null
}

export type BowlPickemFile = {
  seasonYear: number
  status: BowlPickemStatus
  updatedAt: string | null
  oddsUpdatedAt: string | null
  notes: string | null
  games: BowlGame[]
  optOuts: BowlOptOut[]
  staffChanges: BowlStaffChange[]
}

export const BOWL_OPT_OUT_LABELS: Record<BowlOptOutReason, string> = {
  'nfl-draft': 'NFL draft',
  'transfer-portal': 'Transfer portal',
  injury: 'Injury',
  other: 'Other',
}

export const BOWL_STAFF_CHANGE_LABELS: Record<BowlStaffChangeKind, string> = {
  departed: 'Departed',
  hired: 'Hired',
  interim: 'Interim',
}

export const BOWL_STAFF_ROLE_LABELS: Record<BowlStaffRole, string> = {
  'head-coach': 'Head coach',
  coordinator: 'Coordinator',
  other: 'Staff',
}

export function emptyBowlPickem(seasonYear: number): BowlPickemFile {
  return {
    seasonYear,
    status: 'awaiting-matchups',
    updatedAt: null,
    oddsUpdatedAt: null,
    notes: null,
    games: [],
    optOuts: [],
    staffChanges: [],
  }
}

export function emptyBowlSide(name: string): BowlSide {
  return { name, abbrev: null, teamId: null }
}

export function bowlStatusLabel(status: BowlPickemStatus) {
  if (status === 'open') return 'Open'
  if (status === 'final') return 'Final'
  return 'Awaiting matchups'
}

export function formatBowlSpread(value: number | null | undefined) {
  if (value == null) return '—'
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? String(Math.abs(value))
    : Math.abs(value).toFixed(1)
  return value > 0 ? `+${points}` : `-${points}`
}

export function formatFavoriteSpread(homeSpread: number) {
  if (homeSpread === 0) return 'PK'
  return formatBowlSpread(-Math.abs(homeSpread))
}

export function bowlMatchupLabel(game: Pick<BowlGame, 'away' | 'home'>) {
  return `${game.away.name} vs ${game.home.name}`
}

export function mergeStaffChanges(
  existing: BowlStaffChange[],
  incoming: BowlStaffChange[],
) {
  const rows = new Map<string, BowlStaffChange>()
  for (const row of existing) rows.set(row.id, row)
  for (const row of incoming) rows.set(row.id, row)
  return [...rows.values()].sort((left, right) => {
    const byDate = (right.reportedAt ?? '').localeCompare(left.reportedAt ?? '')
    if (byDate !== 0) return byDate
    return left.team.localeCompare(right.team) || left.person.localeCompare(right.person)
  })
}

export function mergeOptOuts(existing: BowlOptOut[], incoming: BowlOptOut[]) {
  const rows = new Map<string, BowlOptOut>()
  for (const row of existing) rows.set(row.id, row)
  for (const row of incoming) rows.set(row.id, row)
  return [...rows.values()].sort((left, right) => {
    const byDate = (right.reportedAt ?? '').localeCompare(left.reportedAt ?? '')
    if (byDate !== 0) return byDate
    return left.team.localeCompare(right.team) || left.player.localeCompare(right.player)
  })
}

export function filesEqualForWrite(
  left: BowlPickemFile,
  right: BowlPickemFile,
) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function rosterMatchForName(
  name: string,
  roster: TeamRosterFile | null | undefined,
) {
  const needle = normalizeScheduleName(name)
  if (!needle) return null
  return (
    roster?.teams.find((team) => {
      if (team.sport !== 'NCAAF') return false
      return (
        normalizeScheduleName(team.name) === needle ||
        normalizeScheduleName(team.location) === needle ||
        normalizeScheduleName(`${team.location ?? ''} ${team.nickname ?? ''}`) ===
          needle
      )
    }) ?? null
  )
}

export function attachRosterToBowlGames(
  games: BowlGame[],
  roster: TeamRosterFile | null | undefined,
) {
  return games.map((game) => {
    const away = rosterMatchForName(game.away.name, roster)
    const home = rosterMatchForName(game.home.name, roster)
    return {
      ...game,
      away: {
        ...game.away,
        abbrev: game.away.abbrev ?? away?.abbrev ?? null,
        teamId: game.away.teamId ?? away?.teamId ?? null,
      },
      home: {
        ...game.home,
        abbrev: game.home.abbrev ?? home?.abbrev ?? null,
        teamId: game.home.teamId ?? home?.teamId ?? null,
      },
    }
  })
}
