import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

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

const rosterIds = new Set(raw.entries.map((entry) => entry.entryId))

function readPlayerTiebreaker(entry) {
  const value = entry.tiebreaker
  if (value == null) {
    return { question: null, answer: null }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `${entry.name ?? entry.entryId} tiebreaker must be an object or null.`,
    )
  }

  let answer = null
  if (value.answer != null) {
    if (typeof value.answer !== 'number' || !Number.isInteger(value.answer)) {
      throw new Error(
        `${entry.name ?? entry.entryId} tiebreaker.answer must be an integer or null.`,
      )
    }
    answer = value.answer
  }

  const question =
    typeof value.question === 'string' && value.question.trim()
      ? value.question.trim()
      : null
  const gameId =
    typeof value.gameId === 'string' && value.gameId.trim()
      ? value.gameId.trim()
      : undefined

  return gameId ? { question, answer, gameId } : { question, answer }
}

const weeks = raw.weeks.map((week) => {
  if (!Array.isArray(week.entries)) {
    throw new Error(`${week.label ?? `Week ${week.week}`} is missing entries[].`)
  }

  const expectedGameIds = week.entries[0]?.picks?.map((pick) => pick.gameId) ?? []

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
        tiebreaker: readPlayerTiebreaker(entry),
        picks: entry.picks.map((pick) => ({
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
        })),
      }
    }),
  }
})

const history = {
  source: {
    fetchedAt: raw.source?.fetchedAt,
    timezone: raw.source?.timezone,
  },
  pool: {
    name: raw.pool?.name,
    seasonYear: raw.pool?.seasonYear,
  },
  entries: raw.entries.map((entry) => ({
    entryId: entry.entryId,
    name: entry.name,
    hasMadeAPick: entry.hasMadeAPick,
    season: entry.season,
  })),
  weeks,
}

const currentPath = resolve('src/data/player-history.json')
try {
  const existing = JSON.parse(await readFile(currentPath, 'utf8'))
  const existingYear = existing.pool?.seasonYear
  const incomingYear = history.pool.seasonYear
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
  }
} catch {
  // First player-history file.
}

await mkdir(resolve('src/data'), { recursive: true })
await writeFile(currentPath, `${JSON.stringify(history, null, 2)}\n`)

const pickRows = weeks.reduce(
  (total, week) =>
    total +
    week.entries.reduce((weekTotal, entry) => weekTotal + entry.picks.length, 0),
  0,
)

console.log(
  `Prepared ${history.entries.length} players, ${weeks.length} week(s), and ${pickRows} pick rows from ${inputPath}.`,
)
