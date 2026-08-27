import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolveCardPick, favorableHook } from '../src/cardScoring.ts'

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

function analyze(game, event) {
  const availableLines = Object.values(event?.lines ?? {})
    .map((entry) => entry?.line)
    .filter((line) => typeof line === 'number')

  if (availableLines.length === 0) {
    return {
      liveHomeSpread: null,
      edge: null,
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
    edge: magnitude,
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
const consensusFeed = JSON.parse(
  await readFile(new URL('src/data/consensus.json', ROOT), 'utf8'),
)

let history = { updatedAt: null, weeks: [] }
try {
  history = JSON.parse(await readFile(OUTPUT, 'utf8'))
} catch {
  // First snapshot.
}

let overrides = { updatedAt: null, weeks: [] }
try {
  overrides = JSON.parse(
    await readFile(new URL('src/data/card-overrides.json', ROOT), 'utf8'),
  )
} catch {
  // No completed card stored yet.
}

const deviationIds = new Set(
  (overrides.weeks ?? [])
    .find((week) => week.week === slate.week.order)
    ?.games?.filter((game) => game.deviate)
    .map((game) => game.gameId) ?? [],
)

const oddsById = new Map((odds.events ?? []).map((event) => [event.cbsEventId, event]))
const consensusByEvent = new Map(
  consensusFeed.week?.order === slate.week.order
    ? (consensusFeed.games ?? []).map((game) => [game.cbsEventId, game])
    : [],
)
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
    return deviationIds.has(game.id) ? { ...previous, deviated: true } : previous
  }

  const analysis = analyze(game, oddsById.get(game.cbsEventId))
  const cardPick = resolveCardPick({
    category: analysis.category,
    recommendedSide: analysis.recommendedSide,
    edge: analysis.edge,
    homeSpread: game.homeSpread,
    liveHomeSpread: analysis.liveHomeSpread,
    consensus: consensusByEvent.get(game.cbsEventId),
  })
  const frozen = {
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
    source: cardPick.source,
    pickedSide: cardPick.pickedSide,
    strength: cardPick.strength,
    score: cardPick.score,
  }
  return deviationIds.has(game.id) ? { ...frozen, deviated: true } : frozen
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
