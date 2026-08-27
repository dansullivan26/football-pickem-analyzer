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

function readInteger(value, label, { allowNull = false } = {}) {
  if (value == null) {
    if (allowNull) return null
    throw new Error(`${label} is required.`)
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`)
  }
  return value
}

function readRequiredText(value, label) {
  const text = readOptionalText(value)
  if (!text) throw new Error(`${label} must be a non-empty string.`)
  return text
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

function readTiebreakerOrder(value, game) {
  const order = readInteger(value, `${game.cbsEventId ?? game.id} tiebreakerOrder`, {
    allowNull: true,
  })
  if (order != null && order < 1) {
    throw new Error(
      `${game.cbsEventId ?? game.id} tiebreakerOrder must be a positive integer.`,
    )
  }
  return order
}

function readTiebreaker(raw, games) {
  if (raw.tiebreaker == null) return undefined
  const value = raw.tiebreaker
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('tiebreaker must be an object or null.')
  }

  const gameId = readRequiredText(value.gameId, 'tiebreaker.gameId')
  const questionId = readRequiredText(
    value.questionId == null ? null : String(value.questionId),
    'tiebreaker.questionId',
  )
  const cbsEventId = readInteger(value.cbsEventId, 'tiebreaker.cbsEventId')
  const order = readInteger(value.order, 'tiebreaker.order')
  if (order < 1) {
    throw new Error('tiebreaker.order must be a positive integer.')
  }
  const question = readRequiredText(value.question, 'tiebreaker.question')
  const type = readRequiredText(value.type, 'tiebreaker.type')

  const game = games.find((row) => row.id === gameId)
  if (!game) {
    throw new Error('tiebreaker.gameId does not match a slate game.')
  }
  if (game.cbsEventId !== cbsEventId) {
    throw new Error('tiebreaker.cbsEventId does not match tiebreaker.gameId.')
  }
  if (game.tiebreakerOrder != null && game.tiebreakerOrder !== order) {
    throw new Error('tiebreaker.order does not match games[].tiebreakerOrder.')
  }

  return {
    gameId,
    cbsEventId,
    order,
    type,
    question,
    questionId,
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
    tiebreakerOrder: readTiebreakerOrder(game.tiebreakerOrder, game),
  })),
}
slate.tiebreaker = readTiebreaker(raw, slate.games)

await mkdir(resolve('src/data'), { recursive: true })
await writeFile(
  resolve('src/data/current-slate.json'),
  `${JSON.stringify(slate, null, 2)}\n`,
)

const tiebreakerNote = slate.tiebreaker
  ? ` Tiebreaker is ${
      slate.games.find((game) => game.id === slate.tiebreaker.gameId)?.away
        .name ?? 'away'
    } @ ${
      slate.games.find((game) => game.id === slate.tiebreaker.gameId)?.home
        .name ?? 'home'
    }.`
  : ''

console.log(
  `Prepared ${slate.week.label} with ${slate.games.length} games from ${inputPath}.${tiebreakerNote}`,
)
