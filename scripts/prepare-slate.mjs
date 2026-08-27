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

function readOptionalText(value) {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text || null
}

function readIndoor(value) {
  if (typeof value === 'boolean') return value
  if (value == null) return null
  if (typeof value !== 'string') {
    throw new Error('venue.indoor must be a boolean, indoor/outdoor, or null.')
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'indoor' || normalized === 'true') return true
  if (normalized === 'outdoor' || normalized === 'false') return false
  throw new Error(`venue.indoor has unexpected value "${value}".`)
}

function readVenue(game) {
  if (game.venue == null) return undefined
  if (typeof game.venue !== 'object' || Array.isArray(game.venue)) {
    throw new Error(`${game.cbsEventId ?? game.id} venue must be an object.`)
  }

  return {
    stadium: readOptionalText(game.venue.stadium),
    city: readOptionalText(game.venue.city),
    state: readOptionalText(game.venue.state),
    indoor: readIndoor(game.venue.indoor),
  }
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
    venue: readVenue(game),
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
