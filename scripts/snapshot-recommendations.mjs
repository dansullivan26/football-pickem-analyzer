import { mkdir, readFile, writeFile } from 'node:fs/promises'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/recommendation-history.json', ROOT)

function roundToHalf(value) {
  return Math.round(value * 2) / 2
}

function classifyEdge(magnitude) {
  if (magnitude >= 3) return 'hammer'
  if (magnitude >= 1.5) return 'lean'
  if (magnitude > 0) return 'slight'
  return 'neutral'
}

function favorableHook(poolHome, bookHome) {
  if (poolHome === 0 || bookHome === 0) return null
  if (Math.sign(poolHome) !== Math.sign(bookHome)) return null
  const pair = new Set([Math.abs(poolHome), Math.abs(bookHome)])
  if (pair.has(2.5) && pair.has(3.5)) return 'fg'
  if (pair.has(6.5) && pair.has(7.5)) return 'td'
  return null
}

function analyze(game, event) {
  const availableLines = Object.values(event?.lines ?? {})
    .map((entry) => entry?.line)
    .filter((line) => typeof line === 'number')

  if (availableLines.length === 0) {
    return {
      liveHomeSpread: null,
      category: 'pending',
      recommendedSide: null,
      hook: null,
    }
  }

  const liveHomeSpread = roundToHalf(
    availableLines.reduce((total, line) => total + line, 0) / availableLines.length,
  )
  const edge = game.homeSpread - liveHomeSpread
  const magnitude = Math.abs(edge)

  return {
    liveHomeSpread,
    category: classifyEdge(magnitude),
    recommendedSide: edge > 0 ? 'home' : edge < 0 ? 'away' : null,
    hook: favorableHook(game.homeSpread, liveHomeSpread),
  }
}

const slate = JSON.parse(
  await readFile(new URL('src/data/current-slate.json', ROOT), 'utf8'),
)
const odds = JSON.parse(
  await readFile(new URL('public/data/odds.json', ROOT), 'utf8'),
)

let history = { updatedAt: null, weeks: [] }
try {
  history = JSON.parse(await readFile(OUTPUT, 'utf8'))
} catch {
  // First snapshot.
}

const oddsById = new Map((odds.events ?? []).map((event) => [event.cbsEventId, event]))
const now = Date.now()
const capturedAt = new Date().toISOString()
const existingWeek = history.weeks.find((week) => week.week === slate.week.order)
const previousById = new Map(
  (existingWeek?.games ?? []).map((game) => [game.cbsEventId, game]),
)

const games = slate.games.map((game) => {
  const previous = previousById.get(game.cbsEventId)
  const kickedOff = new Date(game.kickoff).getTime() <= now

  if (kickedOff && previous) {
    return previous
  }

  const analysis = analyze(game, oddsById.get(game.cbsEventId))
  return {
    cbsEventId: game.cbsEventId,
    sport: game.sport,
    kickoff: game.kickoff,
    away: game.away.abbrev,
    home: game.home.abbrev,
    homeSpread: game.homeSpread,
    liveHomeSpread: analysis.liveHomeSpread,
    category: analysis.category,
    recommendedSide: analysis.recommendedSide,
    hook: analysis.hook,
    cover: previous?.cover ?? null,
  }
})

const week = {
  week: slate.week.order,
  label: slate.week.label,
  capturedAt,
  scored: existingWeek?.scored ?? false,
  games,
}

const weeks = [
  ...history.weeks.filter((entry) => entry.week !== slate.week.order),
  week,
].sort((a, b) => a.week - b.week)

const next = { updatedAt: capturedAt, weeks }

await mkdir(new URL('src/data', ROOT), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(next, null, 2)}\n`)

const open = games.filter((game) => new Date(game.kickoff).getTime() > now).length
const frozen = games.length - open
console.log(
  `Snapshot ${week.label}: ${games.length} games (${open} still open, ${frozen} frozen).`,
)
