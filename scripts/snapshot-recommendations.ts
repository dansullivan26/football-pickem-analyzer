import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolveCardPick, favorableHook, classifyEdge } from '../src/cardScoring.ts'
import { upsertSeasonWeek, weekSeason } from '../src/careerHistory.ts'
import { coversFromPlayerHistory, lookupCover } from '../src/coverResults.ts'
import { attachFrozenRanks } from '../src/teamRanks.ts'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/recommendation-history.json', ROOT)

function attachSlateScores(frozen, game) {
  if (typeof game.awayScore !== 'number' || typeof game.homeScore !== 'number') {
    return frozen
  }
  if (frozen.awayScore === game.awayScore && frozen.homeScore === game.homeScore) {
    return frozen
  }
  return {
    ...frozen,
    awayScore: game.awayScore,
    homeScore: game.homeScore,
  }
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2
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

let playerHistory = { weeks: [] }
try {
  playerHistory = JSON.parse(
    await readFile(new URL('src/data/player-history.json', ROOT), 'utf8'),
  )
} catch {
  // Player ingest has not landed yet.
}
const covers = coversFromPlayerHistory(playerHistory)

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
const seasonYear = slate.pool.seasonYear
const existingWeek = history.weeks.find(
  (week) =>
    week.week === slate.week.order &&
    weekSeason(week, seasonYear) === seasonYear,
)
const previousById = new Map(
  (existingWeek?.games ?? []).map((game) => [game.cbsEventId, game]),
)

const games = slate.games.map((game) => {
  const previous = previousById.get(game.cbsEventId)
  const kickedOff = new Date(game.kickoff).getTime() <= now

  const cover =
    lookupCover(covers, slate.week.order, game.cbsEventId) ?? previous?.cover ?? null

  if (kickedOff && previous) {
    const frozen = cover === previous.cover ? previous : { ...previous, cover }
    const withScores = attachSlateScores(frozen, game)
    const withRanks = attachFrozenRanks(withScores, game, true)
    return deviationIds.has(game.id) ? { ...withRanks, deviated: true } : withRanks
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
    cover,
    source: cardPick.source,
    pickedSide: cardPick.pickedSide,
    strength: cardPick.strength,
    score: cardPick.score,
  }
  const withScores = attachSlateScores(frozen, game)
  const withRanks = attachFrozenRanks(withScores, game, false)
  return deviationIds.has(game.id) ? { ...withRanks, deviated: true } : withRanks
})

const tiebreakerGame = slate.tiebreaker
  ? slate.games.find((game) => game.id === slate.tiebreaker.gameId)
  : undefined
const liveTotal =
  tiebreakerGame != null
    ? oddsById.get(tiebreakerGame.cbsEventId)?.totals?.draftkings?.line
    : undefined
const tiebreakerKickedOff =
  tiebreakerGame != null && new Date(tiebreakerGame.kickoff).getTime() <= now
const previousTiebreaker = existingWeek?.tiebreaker
const tiebreaker =
  tiebreakerGame == null
    ? existingWeek?.tiebreaker ?? null
    : tiebreakerKickedOff && typeof previousTiebreaker?.draftKingsTotal === 'number'
      ? previousTiebreaker
      : {
          cbsEventId: tiebreakerGame.cbsEventId,
          draftKingsTotal:
            typeof liveTotal === 'number'
              ? liveTotal
              : (previousTiebreaker?.draftKingsTotal ?? null),
          frozenAt: tiebreakerKickedOff ? capturedAt : null,
        }

const week = {
  week: slate.week.order,
  seasonYear,
  label: slate.week.label,
  capturedAt,
  scored: existingWeek?.scored ?? false,
  tiebreaker,
  games,
}

const weeks = upsertSeasonWeek(history.weeks, week, seasonYear)

const next = { updatedAt: capturedAt, weeks }

await mkdir(new URL('src/data', ROOT), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(next, null, 2)}\n`)

const open = games.filter((game) => new Date(game.kickoff).getTime() > now).length
const frozen = games.length - open
console.log(
  `Snapshot ${week.label}: ${games.length} games (${open} still open, ${frozen} frozen).` +
    (typeof tiebreaker?.draftKingsTotal === 'number'
      ? ` Tiebreaker O/U ${tiebreaker.draftKingsTotal}${
          tiebreaker.frozenAt ? ' (frozen)' : ''
        }.`
      : ''),
)
