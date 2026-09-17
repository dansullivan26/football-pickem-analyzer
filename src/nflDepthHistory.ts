import {
  firstTeamPlayersFromDepthChart,
  type FirstTeamPlayer,
} from './nflStarterInjuries.ts'

export type NflDepthSnapshot = {
  at: string
  players: FirstTeamPlayer[]
}

export type NflDepthHistoryTeam = {
  abbrev: string
  name: string
  snapshots: NflDepthSnapshot[]
}

export type NflDepthHistoryFile = {
  week: number
  seasonYear: number
  label: string
  updatedAt: string
  note: string
  teams: NflDepthHistoryTeam[]
}

export type DepthChartPull = {
  abbrev: string
  name: string
  depthChart: unknown
}

export const NFL_DEPTH_HISTORY_NOTE =
  'First-team ESPN depth-chart snapshots for the current pool week. Earlier first-team players remain eligible for starter injury matching if ESPN moves a ruled-out player behind his replacement.'

function sortedPlayers(players: Iterable<FirstTeamPlayer>) {
  return [...players].sort(
    (left, right) =>
      (left.athleteId ?? '').localeCompare(right.athleteId ?? '') ||
      left.name.localeCompare(right.name) ||
      left.position.localeCompare(right.position),
  )
}

function samePlayers(left: FirstTeamPlayer[], right: FirstTeamPlayer[]) {
  if (left.length !== right.length) return false
  return left.every(
    (player, index) =>
      player.athleteId === right[index]?.athleteId &&
      player.name === right[index]?.name &&
      player.position === right[index]?.position,
  )
}

export function priorFirstTeamPlayers(
  history: NflDepthHistoryFile | null | undefined,
  abbrev: string,
) {
  const players = new Map<string, FirstTeamPlayer>()
  for (const snapshot of
    history?.teams.find((team) => team.abbrev === abbrev)?.snapshots ?? []) {
    for (const player of snapshot.players) {
      const key = player.athleteId
        ? `id:${player.athleteId}`
        : `name:${player.name.trim().toLowerCase()}`
      if (!players.has(key)) players.set(key, player)
    }
  }
  return [...players.values()]
}

export function updateNflDepthHistory({
  previous,
  week,
  seasonYear,
  label,
  pulledAt,
  pulls,
}: {
  previous: NflDepthHistoryFile | null
  week: number
  seasonYear: number
  label: string
  pulledAt: string
  pulls: DepthChartPull[]
}): NflDepthHistoryFile {
  const keep =
    previous?.week === week && previous.seasonYear === seasonYear
      ? previous
      : null
  const previousByTeam = new Map(
    (keep?.teams ?? []).map((team) => [team.abbrev, team]),
  )

  const teams = pulls
    .map((pull) => {
      const prior = previousByTeam.get(pull.abbrev)
      const players = sortedPlayers(
        firstTeamPlayersFromDepthChart(pull.depthChart).values(),
      )
      const last = prior?.snapshots[prior.snapshots.length - 1]
      const snapshots =
        last && samePlayers(last.players, players)
          ? prior.snapshots
          : [...(prior?.snapshots ?? []), { at: pulledAt, players }]
      return {
        abbrev: pull.abbrev,
        name: pull.name,
        snapshots,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  const changed = teams.some((team) => {
    const prior = previousByTeam.get(team.abbrev)
    return !prior || prior.snapshots.length !== team.snapshots.length
  })

  if (keep && !changed && keep.teams.length === teams.length) return keep
  return {
    week,
    seasonYear,
    label,
    updatedAt: pulledAt,
    note: NFL_DEPTH_HISTORY_NOTE,
    teams,
  }
}
