import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  mergePickChangeLog,
  readFirstSeenAt,
  sanitizePickChanges,
  sanitizePicksCountChanges,
} from '../src/pickChanges.ts'
import type { PlayerHistory } from '../src/types.ts'

const inputArg = process.argv.indexOf('--input')
const inputPath =
  inputArg >= 0
    ? process.argv[inputArg + 1]
    : 'football-fanatics-pool-players.json'

if (!inputPath) {
  throw new Error(
    'Usage: npm run prepare-players -- --input path/to/players.json',
  )
}

const raw = JSON.parse(await readFile(resolve(inputPath), 'utf8'))

if (!Array.isArray(raw.entries) || !Array.isArray(raw.weeks)) {
  throw new Error('Player export must include entries[] and weeks[].')
}

const rosterIds = new Set(raw.entries.map((entry: { entryId: string }) => entry.entryId))

function readOptionalCount(value: unknown, label: string) {
  if (value == null) return null
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer or null.`)
  }
  return value as number
}

function readPlayerTiebreaker(entry: {
  name?: string
  entryId?: string
  tiebreaker?: unknown
}) {
  const value = entry.tiebreaker
  if (value == null) {
    return { question: null, answer: null }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `${entry.name ?? entry.entryId} tiebreaker must be an object or null.`,
    )
  }

  const row = value as { answer?: unknown; question?: unknown; gameId?: unknown }
  let answer = null
  if (row.answer != null) {
    if (typeof row.answer !== 'number' || !Number.isInteger(row.answer)) {
      throw new Error(
        `${entry.name ?? entry.entryId} tiebreaker.answer must be an integer or null.`,
      )
    }
    answer = row.answer
  }

  const question =
    typeof row.question === 'string' && row.question.trim()
      ? row.question.trim()
      : null
  const gameId =
    typeof row.gameId === 'string' && row.gameId.trim()
      ? row.gameId.trim()
      : undefined

  return gameId ? { question, answer, gameId } : { question, answer }
}

const weeks = raw.weeks.map((week: {
  week: number
  periodId: string
  label: string
  status: string
  scored: boolean
  slateFile: string
  entries: Array<{
    entryId: string
    name: string
    weekScore: number | null
    weekRank: number | null
    correctPicks: number | null
    picksCount: number | null
    maxPicksCount?: unknown
    pickStatus?: unknown
    revealedPicksCount?: unknown
    picksCountFirstSeenAt?: unknown
    tiebreaker?: unknown
    picks: Array<Record<string, unknown>>
  }>
}) => {
  if (!Array.isArray(week.entries)) {
    throw new Error(`${week.label ?? `Week ${week.week}`} is missing entries[].`)
  }

  const expectedGameIds =
    week.entries[0]?.picks?.map((pick) => pick.gameId) ?? []

  return {
    week: week.week,
    seasonYear: raw.pool?.seasonYear,
    periodId: week.periodId,
    label: week.label,
    status: week.status,
    scored: week.scored,
    slateFile: week.slateFile,
    entries: week.entries.map((entry) => {
      if (!rosterIds.has(entry.entryId)) {
        throw new Error(
          `${entry.name ?? entry.entryId} is not present in the top-level roster.`,
        )
      }
      if (!Array.isArray(entry.picks)) {
        throw new Error(`${entry.name ?? entry.entryId} is missing picks[].`)
      }

      const gameIds = new Set(entry.picks.map((pick) => pick.gameId))
      if (gameIds.size !== entry.picks.length) {
        throw new Error(`${entry.name ?? entry.entryId} has duplicate gameIds.`)
      }
      if (
        entry.picks.length !== expectedGameIds.length ||
        expectedGameIds.some((gameId) => !gameIds.has(gameId))
      ) {
        throw new Error(
          `${entry.name ?? entry.entryId} does not have the same game grid as the rest of ${week.label}.`,
        )
      }

      for (const pick of entry.picks) {
        if (
          pick.pickedSide != null &&
          pick.pickedSide !== 'home' &&
          pick.pickedSide !== 'away'
        ) {
          throw new Error(`${entry.name ?? entry.entryId} has an invalid pickedSide.`)
        }
        if (
          pick.pickedSide === 'home' &&
          pick.pickedTeam != null &&
          pick.pickedTeam !== pick.home
        ) {
          throw new Error(`${entry.name ?? entry.entryId} has a mismatched home pick.`)
        }
        if (
          pick.pickedSide === 'away' &&
          pick.pickedTeam != null &&
          pick.pickedTeam !== pick.away
        ) {
          throw new Error(`${entry.name ?? entry.entryId} has a mismatched away pick.`)
        }
      }

      return {
        entryId: entry.entryId,
        name: entry.name,
        weekScore: entry.weekScore,
        weekRank: entry.weekRank,
        correctPicks: entry.correctPicks,
        picksCount: entry.picksCount,
        ...(entry.maxPicksCount !== undefined
          ? {
              maxPicksCount: readOptionalCount(
                entry.maxPicksCount,
                `${entry.name}.maxPicksCount`,
              ),
            }
          : {}),
        ...(entry.pickStatus !== undefined
          ? {
              pickStatus:
                typeof entry.pickStatus === 'string'
                  ? entry.pickStatus
                  : null,
            }
          : {}),
        ...(entry.revealedPicksCount !== undefined
          ? {
              revealedPicksCount: readOptionalCount(
                entry.revealedPicksCount,
                `${entry.name}.revealedPicksCount`,
              ),
            }
          : {}),
        ...(entry.picksCountFirstSeenAt !== undefined
          ? {
              picksCountFirstSeenAt: readFirstSeenAt(
                entry.picksCountFirstSeenAt,
              ),
            }
          : {}),
        tiebreaker: readPlayerTiebreaker(entry),
        picks: entry.picks.map((pick) => {
          const firstSeenAt = readFirstSeenAt(pick.firstSeenAt)
          return {
            gameId: pick.gameId,
            cbsEventId: pick.cbsEventId,
            sport: pick.sport,
            away: pick.away,
            home: pick.home,
            homeSpread: pick.homeSpread,
            pickedTeamId: pick.pickedTeamId,
            pickedTeam: pick.pickedTeam,
            pickedSide: pick.pickedSide,
            result: pick.result,
            points: pick.points,
            pickStatus: pick.pickStatus,
            matchStatus: pick.matchStatus,
            ...(firstSeenAt ? { firstSeenAt } : {}),
          }
        }),
      }
    }),
  }
})

const incomingChanges = sanitizePickChanges(
  raw.pickChanges,
  raw.source?.fetchedAt ?? null,
)
const incomingPicksCountChanges = sanitizePicksCountChanges(
  raw.pickChanges,
  raw.source?.fetchedAt ?? null,
)

const currentPath = resolve('src/data/player-history.json')
let existing: PlayerHistory | null = null
try {
  existing = JSON.parse(await readFile(currentPath, 'utf8')) as PlayerHistory
  const existingYear = existing.pool?.seasonYear
  const incomingYear = raw.pool?.seasonYear
  if (
    typeof existingYear === 'number' &&
    typeof incomingYear === 'number' &&
    incomingYear > existingYear
  ) {
    const archiveDir = resolve('src/data/player-seasons')
    await mkdir(archiveDir, { recursive: true })
    const archivePath = resolve(archiveDir, `${existingYear}.json`)
    await writeFile(archivePath, `${JSON.stringify(existing, null, 2)}\n`)
    console.log(`Archived ${existingYear} player history to ${archivePath}.`)
    existing = null
  }
} catch {
  // First player-history file.
}

const pickChanges = mergePickChangeLog(
  existing?.pickChanges,
  incomingChanges,
)
const picksCountChanges = mergePickChangeLog(
  existing?.picksCountChanges,
  incomingPicksCountChanges,
)

const history = {
  source: {
    fetchedAt: raw.source?.fetchedAt,
    timezone: raw.source?.timezone,
  },
  pool: {
    name: raw.pool?.name,
    seasonYear: raw.pool?.seasonYear,
  },
  entries: raw.entries.map((entry: {
    entryId: string
    name: string
    hasMadeAPick: boolean
    season: unknown
  }) => ({
    entryId: entry.entryId,
    name: entry.name,
    hasMadeAPick: entry.hasMadeAPick,
    season: entry.season,
  })),
  weeks,
  ...(pickChanges.length ? { pickChanges } : {}),
  ...(picksCountChanges.length ? { picksCountChanges } : {}),
}

await mkdir(resolve('src/data'), { recursive: true })
await writeFile(currentPath, `${JSON.stringify(history, null, 2)}\n`)

const pickRows = weeks.reduce(
  (total: number, week: { entries: Array<{ picks: unknown[] }> }) =>
    total +
    week.entries.reduce(
      (weekTotal: number, entry) => weekTotal + entry.picks.length,
      0,
    ),
  0,
)

console.log(
  `Prepared ${history.entries.length} players, ${weeks.length} week(s), and ${pickRows} pick rows from ${inputPath}.`,
)
if (incomingChanges.length) {
  console.log(
    `Recorded ${incomingChanges.length} pick change${incomingChanges.length === 1 ? '' : 's'} from this dump.`,
  )
}
if (incomingPicksCountChanges.length) {
  console.log(
    `Recorded ${incomingPicksCountChanges.length} submitted-count change${incomingPicksCountChanges.length === 1 ? '' : 's'} from this dump.`,
  )
}
