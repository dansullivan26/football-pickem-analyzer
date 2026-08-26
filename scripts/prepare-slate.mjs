import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const inputArg = process.argv.indexOf('--input')
const inputPath =
  inputArg >= 0
    ? process.argv[inputArg + 1]
    : 'football-fanatics-pool-week1.json'

if (!inputPath) {
  throw new Error('Usage: npm run prepare-slate -- --input path/to/slate.json')
}

const raw = JSON.parse(await readFile(resolve(inputPath), 'utf8'))
const slate = {
  source: {
    fetchedAt: raw.source.fetchedAt,
    timezone: raw.source.timezone,
  },
  pool: {
    name: raw.pool.name,
    seasonYear: raw.pool.seasonYear,
    entriesCount: raw.pool.entriesCount,
  },
  week: {
    label: raw.week.label,
    order: raw.week.order,
    gamesOnSlate: raw.week.gamesOnSlate,
    ncaafGames: raw.week.ncaafGames,
    nflGames: raw.week.nflGames,
  },
  games: raw.games.map((game) => ({
    id: game.id,
    cbsEventId: game.cbsEventId,
    sport: game.sport,
    week: game.week,
    status: game.status,
    kickoff: game.kickoff,
    kickoffLabel: game.kickoffLabel,
    tv: game.tv,
    away: game.away,
    home: game.home,
    homeSpread: game.homeSpread,
    line: game.line,
  })),
}

await mkdir(resolve('src/data'), { recursive: true })
await writeFile(
  resolve('src/data/current-slate.json'),
  `${JSON.stringify(slate, null, 2)}\n`,
)

console.log(
  `Prepared ${slate.week.label} with ${slate.games.length} games from ${inputPath}.`,
)
