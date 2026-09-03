import { gunzipSync } from 'node:zlib'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  lastKickoffsFromCfbdGames,
  lastKickoffsFromNflverseCsv,
  mergeLastKickoffFiles,
  rosterFromSlate,
  type LastKickoffFile,
  type LastKickoffRow,
} from '../src/lastKickoff.ts'
import type { Slate } from '../src/types.ts'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/last-kickoff.json', ROOT)
const NFLVERSE_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv.gz'
const CFBD_BASE = 'https://api.collegefootballdata.com'

const slate = JSON.parse(
  await readFile(new URL('src/data/current-slate.json', ROOT), 'utf8'),
) as Slate

let previous: LastKickoffFile = {
  updatedAt: null,
  seasonYear: slate.pool.seasonYear,
  teams: [],
}
try {
  previous = JSON.parse(await readFile(OUTPUT, 'utf8')) as LastKickoffFile
} catch {
  // First snapshot.
}

const roster = rosterFromSlate(slate)
const nowMs = Date.now()
const seasonYear = slate.pool.seasonYear
const apiKey = process.env.CFBD_API_KEY?.trim() ?? ''

const nflRows = await fetchNflverse(seasonYear, roster, nowMs).catch((error) => {
  console.warn(
    'nflverse schedules missed this run:',
    error instanceof Error ? error.message : error,
  )
  return keepSource(previous.teams, 'nflverse')
})

let cfbdRows = keepSource(previous.teams, 'cfbd')
if (!apiKey) {
  console.warn(
    'CFBD_API_KEY is not set — keeping any previous college last-kickoff rows. Get a free key at https://collegefootballdata.com/key and add it as the CFBD_API_KEY repository secret.',
  )
} else {
  try {
    cfbdRows = await fetchCfbd(apiKey, seasonYear, roster, nowMs)
  } catch (error) {
    console.warn(
      'CFBD games missed this run:',
      error instanceof Error ? error.message : error,
    )
  }
}

const next = mergeLastKickoffFiles(
  seasonYear,
  new Date(nowMs).toISOString(),
  nflRows,
  cfbdRows,
)
const teamsChanged =
  previous.seasonYear !== next.seasonYear ||
  JSON.stringify(previous.teams) !== JSON.stringify(next.teams)
const file = teamsChanged ? next : previous

await mkdir(new URL('src/data', ROOT), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(file, null, 2)}\n`)

const nfl = file.teams.filter((row) => row.key.startsWith('NFL:')).length
const ncaaf = file.teams.filter((row) => row.key.startsWith('NCAAF:')).length
console.log(
  `Last kickoff ${file.seasonYear}: ${file.teams.length} teams (${ncaaf} NCAAF, ${nfl} NFL)` +
    (teamsChanged ? '.' : ' — unchanged.'),
)

function keepSource(
  teams: LastKickoffRow[],
  source: LastKickoffRow['source'],
) {
  return teams.filter((row) => row.source === source)
}

async function fetchNflverse(
  year: number,
  teams: ReturnType<typeof rosterFromSlate>,
  now: number,
) {
  const response = await fetch(NFLVERSE_URL, {
    headers: { 'user-agent': 'football-pickem-analyzer last-kickoff' },
  })
  if (!response.ok) {
    throw new Error(`nflverse schedules failed: ${response.status}`)
  }
  const csv = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8')
  return lastKickoffsFromNflverseCsv(csv, year, teams, now)
}

async function fetchCfbd(
  key: string,
  year: number,
  teams: ReturnType<typeof rosterFromSlate>,
  now: number,
) {
  const games = await cfbdGames(key, year)
  return lastKickoffsFromCfbdGames(games, teams, now)
}

async function cfbdGames(key: string, year: number) {
  const both = await cfbdJson(key, `/games?year=${year}&seasonType=both`)
  if (Array.isArray(both) && both.length > 0) return both
  const regular = await cfbdJson(key, `/games?year=${year}&seasonType=regular`)
  const post = await cfbdJson(key, `/games?year=${year}&seasonType=postseason`)
  return [...asRecords(regular), ...asRecords(post)]
}

async function cfbdJson(key: string, path: string) {
  const response = await fetch(`${CFBD_BASE}${path}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${key}`,
      'user-agent': 'football-pickem-analyzer last-kickoff',
    },
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'CFBD rejected the key. Confirm CFBD_API_KEY from https://collegefootballdata.com/key',
    )
  }
  if (!response.ok) {
    throw new Error(`CFBD ${path} failed: ${response.status}`)
  }
  return response.json()
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}
