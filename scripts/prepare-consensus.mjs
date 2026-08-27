import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const inputArg = process.argv.indexOf('--input')
const inputPath =
  inputArg >= 0
    ? process.argv[inputArg + 1]
    : 'football-fanatics-pool-consensus.json'

if (!inputPath) {
  throw new Error(
    'Usage: npm run prepare-consensus -- --input path/to/consensus.json',
  )
}

const raw = JSON.parse(await readFile(resolve(inputPath), 'utf8'))
const slate = JSON.parse(
  await readFile(resolve('src/data/current-slate.json'), 'utf8'),
)

if (!Array.isArray(raw.games)) {
  throw new Error('Consensus export must include games[].')
}
if (!raw.source?.fetchedAt) {
  throw new Error('Consensus export must include source.fetchedAt.')
}
if (raw.week?.order !== slate.week.order) {
  throw new Error(
    `Consensus export is for week ${raw.week?.order}, but the prepared slate is week ${slate.week.order}.`,
  )
}

const slateGames = new Map(slate.games.map((game) => [game.cbsEventId, game]))
const seen = new Set()

function readSide(side, label, game, matched) {
  if (!side?.name || !side?.abbrev) {
    throw new Error(`${label} in ${game.gameId} is missing a team name.`)
  }
  if (!matched) {
    return {
      name: side.name,
      abbrev: side.abbrev,
      coversName: null,
      spread: null,
      pct: null,
      picks: null,
    }
  }
  if (typeof side.pct !== 'number' || typeof side.picks !== 'number') {
    throw new Error(`${label} in ${game.gameId} is matched but has no picks.`)
  }
  if (side.pct < 0 || side.pct > 100) {
    throw new Error(`${label} in ${game.gameId} has an out-of-range pct.`)
  }
  return {
    name: side.name,
    abbrev: side.abbrev,
    coversName: side.coversName ?? null,
    spread: typeof side.spread === 'number' ? side.spread : null,
    pct: side.pct,
    picks: side.picks,
  }
}

function readAtsByLine(game, matched) {
  if (!Array.isArray(game.atsByLine)) {
    throw new Error(`${game.gameId} must include atsByLine[].`)
  }
  if (!matched && game.atsByLine.length > 0) {
    throw new Error(`${game.gameId} is unmatched but has ATS line buckets.`)
  }

  const seenSpreads = new Set()
  return game.atsByLine.map((row, index) => {
    const label = `${game.gameId} atsByLine[${index}]`
    if (
      typeof row?.awaySpread !== 'number' ||
      !Number.isFinite(row.awaySpread) ||
      !Number.isInteger(row.awaySpread * 2)
    ) {
      throw new Error(`${label} must have a numeric half-point awaySpread.`)
    }
    if (
      !Number.isInteger(row.awayPicks) ||
      row.awayPicks < 0 ||
      !Number.isInteger(row.homePicks) ||
      row.homePicks < 0
    ) {
      throw new Error(`${label} must have non-negative integer pick counts.`)
    }
    if (seenSpreads.has(row.awaySpread)) {
      throw new Error(`${game.gameId} has duplicate ATS bucket ${row.awaySpread}.`)
    }
    seenSpreads.add(row.awaySpread)
    return {
      awaySpread: row.awaySpread,
      awayPicks: row.awayPicks,
      homePicks: row.homePicks,
    }
  })
}

const games = raw.games.map((game) => {
  const slateGame = slateGames.get(game.cbsEventId)
  if (!slateGame) {
    throw new Error(
      `Consensus game ${game.gameId} (${game.away?.name} @ ${game.home?.name}) is not on the prepared slate.`,
    )
  }
  if (seen.has(game.cbsEventId)) {
    throw new Error(`Duplicate consensus entry for cbsEventId ${game.cbsEventId}.`)
  }
  seen.add(game.cbsEventId)

  const matched = game.matchStatus === 'matched'
  const coversDetailsUrl =
    typeof game.coversDetailsUrl === 'string' &&
    game.coversDetailsUrl.startsWith('https://contests.covers.com/')
      ? game.coversDetailsUrl
      : null
  if (matched && coversDetailsUrl == null) {
    throw new Error(`${game.gameId} is matched but has no Covers details URL.`)
  }

  const away = readSide(game.away, 'Away side', game, matched)
  const home = readSide(game.home, 'Home side', game, matched)
  const atsByLine = readAtsByLine(game, matched)

  if (matched) {
    const total = away.pct + home.pct
    // Covers rounds each side, so the pair can land a point off 100.
    if (Math.abs(total - 100) > 1) {
      throw new Error(
        `${away.name} @ ${home.name} consensus percentages total ${total}.`,
      )
    }
    if (
      away.spread != null &&
      home.spread != null &&
      away.spread + home.spread !== 0
    ) {
      console.warn(
        `Warning: ${away.name} @ ${home.name} has non-mirrored Covers sides (${away.spread} / ${home.spread}).`,
      )
    }

    const headlinePicks = away.picks + home.picks
    const bucketPicks = atsByLine.reduce(
      (sum, row) => sum + row.awayPicks + row.homePicks,
      0,
    )
    if (atsByLine.length > 0 && Math.abs(headlinePicks - bucketPicks) > 5) {
      console.warn(
        `Warning: ${away.name} @ ${home.name} headline has ${headlinePicks} picks but ATS buckets have ${bucketPicks}.`,
      )
    }
  }

  return {
    gameId: game.gameId,
    cbsEventId: game.cbsEventId,
    sport: slateGame.sport,
    kickoff: game.kickoff,
    matchStatus: matched ? 'matched' : 'unmatched',
    coversDetailsUrl,
    cbsHomeSpread: slateGame.homeSpread,
    away,
    home,
    atsByLine,
  }
})

const missing = slate.games.filter((game) => !seen.has(game.cbsEventId))
for (const game of missing) {
  console.warn(
    `Warning: no consensus row captured for ${game.away.name} @ ${game.home.name}.`,
  )
}

const matchedCount = games.filter((game) => game.matchStatus === 'matched').length

const consensus = {
  source: {
    site: raw.source.site,
    product: raw.source.product,
    description: raw.source.description,
    fetchedAt: raw.source.fetchedAt,
    timezone: raw.source.timezone,
  },
  week: {
    order: raw.week.order,
    label: raw.week.label,
    gamesOnSlate: slate.games.length,
    matched: matchedCount,
    unmatched: games.length - matchedCount,
  },
  games,
}

await mkdir(resolve('src/data'), { recursive: true })
await writeFile(
  resolve('src/data/consensus.json'),
  `${JSON.stringify(consensus, null, 2)}\n`,
)

console.log(
  `Prepared ${matchedCount} of ${slate.games.length} ${consensus.week.label} consensus rows from ${inputPath}.`,
)
