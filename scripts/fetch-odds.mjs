import { readFile, writeFile } from 'node:fs/promises'

const API_URL = 'https://api.sharpapi.io/api/v1/odds'
const API_KEY = process.env.SHARP_API_KEY
const BOOKS = ['draftkings', 'fanduel']
const MAX_PAGES = 25
const ROOT = new URL('../', import.meta.url)
const slate = JSON.parse(
  await readFile(new URL('src/data/current-slate.json', ROOT), 'utf8'),
)

if (!API_KEY) {
  throw new Error('SHARP_API_KEY is required')
}

const aliases = new Map([
  ['miamifla', 'miamifl'],
  ['miamihurricanes', 'miamifl'],
  ['miamioh', 'miamiohio'],
  ['olemiss', 'mississippi'],
  ['thecitadel', 'citadel'],
])

function normalize(value) {
  const normalized = value
    .toLowerCase()
    .replace(/\bst\.?\b/g, 'state')
    .replace(/[^a-z0-9]/g, '')
  return aliases.get(normalized) ?? normalized
}

// Matching is exact against known spellings rather than substring based, so
// that "Idaho @ Utah" cannot be mistaken for "Idaho State @ Utah State".
function teamAliases(team) {
  const { name, location, abbrev, nickname } = team
  return new Set(
    [
      name,
      location,
      abbrev,
      `${location} ${nickname}`,
      `${name} ${nickname}`,
      `${abbrev} ${nickname}`,
    ]
      .filter(Boolean)
      .map(normalize),
  )
}

function teamMatches(cbsTeam, bookTeam) {
  return teamAliases(cbsTeam).has(normalize(bookTeam))
}

function matchGame(row) {
  const kickoff = new Date(row.event_start_time).getTime()
  return slate.games.find((game) => {
    const kickoffDifference = Math.abs(new Date(game.kickoff).getTime() - kickoff)
    return (
      kickoffDifference <= 6 * 60 * 60 * 1000 &&
      teamMatches(game.home, row.home_team) &&
      teamMatches(game.away, row.away_team)
    )
  })
}

async function fetchLeague(league) {
  const rows = []
  let cursor
  let pages = 0

  do {
    const url = new URL(API_URL)
    url.searchParams.set('league', league)
    url.searchParams.set('sportsbook', BOOKS.join(','))
    url.searchParams.set('market', 'point_spread')
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)

    const response = await fetch(url, { headers: { 'X-API-Key': API_KEY } })
    if (!response.ok) {
      throw new Error(
        `SharpAPI ${league} request failed: ${response.status} ${await response.text()}`,
      )
    }

    const body = await response.json()
    rows.push(...body.data)
    pages += 1
    cursor = body.pagination?.has_more ? body.pagination.next_cursor : undefined
  } while (cursor && pages < MAX_PAGES)

  console.log(`${league}: ${rows.length} rows across ${pages} page(s).`)
  return rows
}

const rawRows = (
  await Promise.all([fetchLeague('nfl'), fetchLeague('ncaaf')])
).flat()

const rowsByBook = new Map()
const rejections = new Map()

function reject(reason) {
  rejections.set(reason, (rejections.get(reason) ?? 0) + 1)
}

// Rows whose main/alternate cohort has not been published yet arrive with both
// flags false, so alternate lines are excluded rather than main lines required.
function usableSpread(row) {
  const failure =
    (row.market_type !== 'point_spread' && 'not a point spread') ||
    (row.selection_type !== 'home' && 'not the home side') ||
    (typeof row.line !== 'number' && 'missing line value') ||
    (row.is_live === true && 'live market') ||
    (row.is_active === false && 'suspended market') ||
    (row.is_alternate_line === true && 'alternate line')

  if (failure) {
    reject(failure)
    return false
  }
  return true
}

const matched = new Map()
const unmatched = new Map()

// Set DEBUG_EVENT_ID to a cbsEventId to dump every raw row for that matchup,
// including rows the filters discard.
const DEBUG_EVENT_ID = process.env.DEBUG_EVENT_ID
const debugGame = DEBUG_EVENT_ID
  ? slate.games.find((game) => String(game.cbsEventId) === DEBUG_EVENT_ID)
  : undefined
const debugRows = []

for (const row of rawRows) {
  rowsByBook.set(row.sportsbook, (rowsByBook.get(row.sportsbook) ?? 0) + 1)

  if (
    debugGame &&
    (teamMatches(debugGame.home, row.home_team) ||
      teamMatches(debugGame.home, row.away_team) ||
      teamMatches(debugGame.away, row.home_team) ||
      teamMatches(debugGame.away, row.away_team))
  ) {
    debugRows.push(row)
  }

  if (!usableSpread(row)) continue

  const game = matchGame(row)
  if (!game) {
    unmatched.set(`${row.away_team} @ ${row.home_team}`, row.event_start_time)
    continue
  }

  const entry = matched.get(game.cbsEventId) ?? { game, books: new Map() }
  const priority = row.is_main_line === true ? 2 : 1
  const previous = entry.books.get(row.sportsbook)
  if (!previous || priority >= previous.priority) {
    entry.books.set(row.sportsbook, { line: row.line, priority })
  }
  matched.set(game.cbsEventId, entry)
}

if (debugGame) {
  console.log(
    `\nRaw rows touching ${debugGame.away.name} @ ${debugGame.home.name} (${debugRows.length}):`,
  )
  for (const row of debugRows) {
    console.log(JSON.stringify(row))
  }
}

const OUTPUT = new URL('public/data/odds.json', ROOT)

// Book coverage fluctuates between runs, so a game priced earlier can vanish
// from a later snapshot. Keep the last known price until kickoff rather than
// letting the site lose a line it already had.
const previousLines = new Map()
try {
  const previous = JSON.parse(await readFile(OUTPUT, 'utf8'))
  for (const event of previous.events ?? []) {
    previousLines.set(event.cbsEventId, event.lines ?? {})
  }
} catch {
  // First run, or the file was never generated.
}

const runAt = new Date().toISOString()
const now = Date.now()
let carried = 0

const events = slate.games
  .filter((game) => new Date(game.kickoff).getTime() > now)
  .map((game) => {
    const books = matched.get(game.cbsEventId)?.books ?? new Map()
    const lines = Object.fromEntries(
      [...books].map(([book, { line }]) => [book, { line, retrievedAt: runAt }]),
    )

    for (const [book, previous] of Object.entries(
      previousLines.get(game.cbsEventId) ?? {},
    )) {
      if (!(book in lines) && typeof previous?.line === 'number') {
        lines[book] = previous
        carried += 1
      }
    }

    return {
      cbsEventId: game.cbsEventId,
      sport: game.sport,
      kickoff: game.kickoff,
      awayTeam: game.away.name,
      homeTeam: game.home.name,
      lines,
    }
  })
  .filter((event) => Object.keys(event.lines).length > 0)
  .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

const feed = {
  provider: 'SharpAPI',
  updatedAt: runAt,
  books: [
    { key: 'draftkings', name: 'DraftKings' },
    { key: 'fanduel', name: 'FanDuel' },
  ],
  events,
}

await writeFile(OUTPUT, `${JSON.stringify(feed, null, 2)}\n`)

console.log(`\nMatched ${matched.size}/${slate.games.length} slate games.`)
if (carried) {
  console.log(`Carried forward ${carried} price(s) missing from this snapshot.`)
}

console.log('\nRows returned per sportsbook:')
for (const book of new Set([...BOOKS, ...rowsByBook.keys()])) {
  console.log(`  - ${book}: ${rowsByBook.get(book) ?? 0}`)
}

const coverage = BOOKS.map(
  (book) =>
    `${book}: ${feed.events.filter((event) => book in event.lines).length}`,
)
console.log(`\nSlate games priced per book — ${coverage.join(', ')}`)

if (rejections.size) {
  console.log('\nRows skipped:')
  for (const [reason, count] of [...rejections].sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}: ${count}`)
  }
}

const missing = slate.games.filter((game) => !matched.has(game.cbsEventId))
if (missing.length) {
  console.log(`\nSlate games without a book line (${missing.length}):`)
  for (const game of missing) {
    console.log(`  - ${game.away.name} @ ${game.home.name} (${game.kickoffLabel})`)
  }
}

if (unmatched.size) {
  console.log(`\nBook events not matched to the slate (${unmatched.size}):`)
  for (const [name, start] of [...unmatched].sort((a, b) =>
    a[1].localeCompare(b[1]),
  )) {
    console.log(`  - ${name} (${start})`)
  }
}
