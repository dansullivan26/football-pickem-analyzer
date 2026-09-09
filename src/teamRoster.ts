import type { Slate, Team } from './types.ts'

/**
 * Team identity survives past the week a team is on the card. Frozen
 * recommendations only keep abbrevs, so without this the Teams page falls back
 * to `ARKST` with no conference once a team drops off the live slate.
 */
export type TeamRosterEntry = {
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  name: string
  location: string | null
  nickname: string | null
  conference: string | null
  teamId: string | null
}

export type TeamRosterFile = {
  updatedAt: string | null
  teams: TeamRosterEntry[]
}

export const EMPTY_TEAM_ROSTER: TeamRosterFile = { updatedAt: null, teams: [] }

export function teamRosterKey(sport: 'NFL' | 'NCAAF', abbrev: string) {
  return `${sport}:${abbrev}`
}

function text(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function teamsFromSlate(slate: Slate): TeamRosterEntry[] {
  const teams = new Map<string, TeamRosterEntry>()
  for (const game of slate.games) {
    for (const side of [game.away, game.home] as Team[]) {
      const abbrev = text(side.abbrev)
      if (!abbrev) continue
      teams.set(teamRosterKey(game.sport, abbrev), {
        sport: game.sport,
        abbrev,
        name: text(side.name) ?? abbrev,
        location: text(side.location),
        nickname: text(side.nickname),
        conference: text(side.conference),
        teamId: text(side.id),
      })
    }
  }
  return [...teams.values()]
}

/** Newer CBS values win; anything the new dump omits keeps what we already had. */
function mergeEntry(
  existing: TeamRosterEntry,
  incoming: TeamRosterEntry,
): TeamRosterEntry {
  return {
    sport: incoming.sport,
    abbrev: incoming.abbrev,
    name: text(incoming.name) ?? existing.name,
    location: incoming.location ?? existing.location,
    nickname: incoming.nickname ?? existing.nickname,
    conference: incoming.conference ?? existing.conference,
    teamId: incoming.teamId ?? existing.teamId,
  }
}

export function mergeTeamRoster(
  existing: TeamRosterFile | null | undefined,
  incoming: TeamRosterEntry[],
  updatedAt = new Date().toISOString(),
): TeamRosterFile {
  const teams = new Map<string, TeamRosterEntry>()
  for (const entry of existing?.teams ?? []) {
    teams.set(teamRosterKey(entry.sport, entry.abbrev), entry)
  }
  for (const entry of incoming) {
    const key = teamRosterKey(entry.sport, entry.abbrev)
    const prior = teams.get(key)
    teams.set(key, prior ? mergeEntry(prior, entry) : entry)
  }
  return {
    updatedAt,
    teams: [...teams.values()].sort(
      (left, right) =>
        left.sport.localeCompare(right.sport) ||
        left.abbrev.localeCompare(right.abbrev),
    ),
  }
}

export function teamRosterIndex(roster: TeamRosterFile | null | undefined) {
  return new Map(
    (roster?.teams ?? []).map((entry) => [
      teamRosterKey(entry.sport, entry.abbrev),
      entry,
    ]),
  )
}
