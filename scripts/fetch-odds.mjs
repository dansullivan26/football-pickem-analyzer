import { readFile, writeFile } from 'node:fs/promises'

const API_URL = 'https://api.sharpapi.io/api/v1/odds'
const API_KEY = process.env.SHARP_API_KEY
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
    .replace(/\b(state|st\.)\b/g, 'state')
    .replace(/[^a-z0-9]/g, '')
  return aliases.get(normalized) ?? normalized
}

function teamMatches(cbsTeam, bookTeam) {
  const book = normalize(bookTeam)
  return [cbsTeam.name, cbsTeam.location, cbsTeam.abbrev]
    .map(normalize)
    .some((candidate) => candidate.length >= 3 && (
      book.includes(candidate) || candidate.includes(book)
    ))
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

  do {
    const url = new URL(API_URL)
    url.searchParams.set('league', league)
    url.searchParams.set('sportsbook', 'draftkings,fanduel')
    url.searchParams.set('market', 'point_spread')
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)

    const response = await fetch(url, {
      headers: { 'X-API-Key': API_KEY },
    })
    if (!response.ok) {
      throw new Error(`SharpAPI ${league} request failed: ${response.status} ${await response.text()}`)
    }

    const body = await response.json()
    rows.push(...body.data)
    cursor = body.pagination?.has_more ? body.pagination.next_cursor : undefined
  } while (cursor)

  return rows
}

const rawRows = (
  await Promise.all([
    fetchLeague('nfl'),
    fetchLeague('ncaaf'),
  ])
).flat()

const events = new Map()
const unmatched = new Map()

for (const row of rawRows) {
  if (
    row.market_type !== 'point_spread' ||
    row.selection_type !== 'home' ||
    row.is_main_line !== true ||
    row.is_live === true ||
    row.is_active === false ||
    typeof row.line !== 'number'
  ) {
    continue
  }

  const game = matchGame(row)
  if (!game) {
    unmatched.set(`${row.away_team} @ ${row.home_team}`, row.event_start_time)
    continue
  }

  const existing = events.get(game.cbsEventId) ?? {
    cbsEventId: game.cbsEventId,
    sport: game.sport,
    kickoff: game.kickoff,
    awayTeam: game.away.name,
    homeTeam: game.home.name,
    lines: {},
  }
  existing.lines[row.sportsbook] = row.line
  events.set(game.cbsEventId, existing)
}

const feed = {
  provider: 'SharpAPI',
  updatedAt: new Date().toISOString(),
  books: [
    { key: 'draftkings', name: 'DraftKings' },
    { key: 'fanduel', name: 'FanDuel' },
  ],
  events: [...events.values()].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  ),
}

await writeFile(
  new URL('public/data/odds.json', ROOT),
  `${JSON.stringify(feed, null, 2)}\n`,
)

console.log(`Matched ${events.size}/${slate.games.length} slate games.`)

const missing = slate.games.filter((game) => !events.has(game.cbsEventId))
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
