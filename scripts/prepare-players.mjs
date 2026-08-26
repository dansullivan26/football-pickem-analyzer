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

const weeks = raw.weeks.map((week) => {
  if (!Array.isArray(week.entries)) {
    throw new Error(`${week.label ?? `Week ${week.week}`} is missing entries[].`)
  }

  const expectedGameIds = week.entries[0]?.picks?.map((pick) => pick.gameId) ?? []

  return {
    week: week.week,
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
        tiebreaker: entry.tiebreaker,
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

await mkdir(resolve('src/data'), { recursive: true })
await writeFile(
  resolve('src/data/player-history.json'),
  `${JSON.stringify(history, null, 2)}\n`,
)

const pickRows = weeks.reduce(
  (total, week) =>
    total +
    week.entries.reduce((weekTotal, entry) => weekTotal + entry.picks.length, 0),
  0,
)

console.log(
  `Prepared ${history.entries.length} players, ${weeks.length} week(s), and ${pickRows} pick rows from ${inputPath}.`,
)
