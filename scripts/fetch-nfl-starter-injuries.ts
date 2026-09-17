import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  updateInjuryLineHistory,
  type InjuryLineHistory,
} from '../src/injuryLineMoves.ts'
import {
  injuriesByEspnTeam,
  starterInjuriesForTeam,
  type NflStarterInjuryFile,
  type NflStarterInjuryTeam,
} from '../src/nflStarterInjuries.ts'
import type { OddsFeed, Slate } from '../src/types.ts'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/nfl-starter-injuries.json', ROOT)
const HISTORY_OUTPUT = new URL('src/data/injury-line-history.json', ROOT)
const ODDS = new URL('public/data/odds.json', ROOT)
const ESPN =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

const CBS_TO_ESPN_ABBREV: Record<string, string> = {
  JAC: 'JAX',
  WAS: 'WSH',
}

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

async function fetchJson(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'football-pickem-analyzer/1.0',
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750))
      }
    }
  }
  throw new Error(
    `ESPN request failed for ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

const slate = JSON.parse(
  await readFile(new URL('src/data/current-slate.json', ROOT), 'utf8'),
) as Slate

const nflTeams = new Map<
  string,
  { abbrev: string; name: string }
>()
for (const game of slate.games.filter((row) => row.sport === 'NFL')) {
  for (const team of [game.away, game.home]) {
    nflTeams.set(team.abbrev, {
      abbrev: team.abbrev,
      name: team.name,
    })
  }
}

const [teamIndexRaw, injuryReportRaw] = await Promise.all([
  fetchJson(`${ESPN}/teams?limit=100`),
  fetchJson(`${ESPN}/injuries`),
])

const indexRoot = row(teamIndexRaw)
const indexTeams = rows(
  rows(rows(indexRoot.sports)[0]?.leagues)[0]?.teams,
).map((entry) => row(entry.team))
const espnByAbbrev = new Map(
  indexTeams.flatMap((team) => {
    const abbrev = text(team.abbreviation)
    const id = text(team.id)
    const displayName = text(team.displayName)
    return abbrev && id
      ? [[abbrev, { id, displayName: displayName ?? abbrev }] as const]
      : []
  }),
)
const injuriesByTeam = injuriesByEspnTeam(injuryReportRaw)
const reportUpdatedAt = text(row(injuryReportRaw).timestamp)

const teams: NflStarterInjuryTeam[] = await Promise.all(
  [...nflTeams.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (team) => {
      const espnAbbrev = CBS_TO_ESPN_ABBREV[team.abbrev] ?? team.abbrev
      const espn = espnByAbbrev.get(espnAbbrev)
      if (!espn) {
        return {
          abbrev: team.abbrev,
          name: team.name,
          espnTeamId: '',
          depthChartAt: null,
          status: 'unavailable',
          injuries: [],
        }
      }
      try {
        const depthChart = await fetchJson(
          `${ESPN}/teams/${espn.id}/depthcharts`,
        )
        return {
          abbrev: team.abbrev,
          name: team.name,
          espnTeamId: espn.id,
          depthChartAt: text(row(depthChart).timestamp),
          status: 'ok',
          injuries: starterInjuriesForTeam(
            injuriesByTeam.get(espn.id) ?? [],
            depthChart,
          ),
        }
      } catch (error) {
        console.warn(
          `Starter availability unavailable for ${team.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        return {
          abbrev: team.abbrev,
          name: team.name,
          espnTeamId: espn.id,
          depthChartAt: null,
          status: 'unavailable',
          injuries: [],
        }
      }
    }),
)

const file: NflStarterInjuryFile = {
  source: {
    provider: 'ESPN',
    fetchedAt: new Date().toISOString(),
    reportUpdatedAt,
    note:
      'Starter means first team on ESPN’s current depth chart. ESPN is an unofficial availability source; verify final inactives before kickoff.',
  },
  teams,
}

await mkdir(new URL('src/data', ROOT), { recursive: true })
const previousInjuries = await readJson<NflStarterInjuryFile>(OUTPUT)
const previousHistory = await readJson<InjuryLineHistory>(HISTORY_OUTPUT)
const odds = await readJson<OddsFeed>(ODDS)

await writeFile(OUTPUT, `${JSON.stringify(file, null, 2)}\n`)

const history = updateInjuryLineHistory({
  previousHistory,
  previousInjuries,
  nextInjuries: file,
  slate,
  events: odds?.events ?? [],
  runAt: file.source.fetchedAt,
})
await writeFile(HISTORY_OUTPUT, `${JSON.stringify(history, null, 2)}\n`)

const changeCount = history.games.reduce(
  (sum, game) =>
    sum + game.events.filter((event) => event.at === history.updatedAt).length,
  0,
)
console.log(
  `Prepared ${teams.reduce((sum, team) => sum + team.injuries.length, 0)} starter availability rows across ${teams.length} NFL teams. ${changeCount} status change${changeCount === 1 ? '' : 's'} vs the last snapshot.`,
)

async function readJson<T>(url: URL): Promise<T | null> {
  try {
    return JSON.parse(await readFile(url, 'utf8')) as T
  } catch {
    return null
  }
}
