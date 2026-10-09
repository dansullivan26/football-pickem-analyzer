import { readFile, writeFile } from 'node:fs/promises'
import { generateSuggestedCard } from '../src/cardStrategy.ts'
import { classifyEdge } from '../src/cardScoring.ts'
import { poolSupportProjectionsForWeek } from '../src/cardPoolAware.ts'
import { gameIsUpcoming } from '../src/gameStatus.ts'
import {
  lineHistoryByEvent,
  ticksEndingAtLive,
} from '../src/lineHistory.ts'
import { buildTeamDirectory, teamKey } from '../src/teamPerformance.ts'
import { buildTravelRestIndex } from '../src/travelRest.ts'
import type { LastKickoffFile } from '../src/lastKickoff.ts'
import type { PredictionForecasts } from '../src/playerPrediction.ts'
import type { WeatherHistoryFile } from '../src/weatherBuckets.ts'
import type { TeamRosterFile } from '../src/teamRoster.ts'
import type { NflStarterInjuryFile } from '../src/nflStarterInjuries.ts'
import type {
  ConsensusFeed,
  GameAnalysis,
  LineHistory,
  OddsEvent,
  OddsFeed,
  PlayerHistory,
  RecommendationHistory,
  Slate,
  SlateGame,
} from '../src/types.ts'
import {
  GEMINI_ASK_BUDGET,
  buildNeutralPacket,
  emptyNeutralBriefs,
  freezeNeutralBrief,
  isScoutGameDay,
  lookupNeutralBrief,
  selectGameDayScoutAsks,
  summarizeGeminiError,
  type NeutralBriefsFile,
  type NeutralCardPick,
} from '../src/neutralBrief.ts'
import { askCursor } from './askCursor.ts'
import { askScout, resolveScoutConfig } from '../src/scoutProvider.ts'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/neutral-briefs.json', ROOT)
const PROMPT_FILE = new URL('src/data/leftover-scout-prompt.md', ROOT)
const FORCE = process.argv.includes('--force')
const ASK_ALL = process.argv.includes('--all')
const SCOUT = resolveScoutConfig(process.env)
const ASK_LIMIT = ASK_ALL
  ? Number.POSITIVE_INFINITY
  : Number(process.env.SCOUT_ASK_LIMIT || process.env.GEMINI_ASK_LIMIT) ||
    GEMINI_ASK_BUDGET

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2
}

function analyzeGame(game: SlateGame, odds: OddsEvent | undefined, consensus: GameAnalysis['consensus']): GameAnalysis {
  const availableLines = odds
    ? Object.values(odds.lines)
        .map((entry) => entry?.line)
        .filter((line): line is number => typeof line === 'number')
    : []

  if (availableLines.length === 0) {
    return {
      game,
      odds,
      consensus,
      liveHomeSpread: null,
      edge: null,
      category: 'pending',
      recommendedSide: null,
    }
  }

  const liveHomeSpread = roundToHalf(
    availableLines.reduce((total, line) => total + line, 0) / availableLines.length,
  )
  const edge = game.homeSpread - liveHomeSpread
  const magnitude = Math.abs(edge)

  return {
    game,
    odds,
    consensus,
    liveHomeSpread,
    edge: magnitude,
    category: classifyEdge(magnitude),
    recommendedSide: edge > 0 ? 'home' : edge < 0 ? 'away' : null,
  }
}

const slate = JSON.parse(
  await readFile(new URL('src/data/current-slate.json', ROOT), 'utf8'),
) as Slate
const odds = JSON.parse(
  await readFile(new URL('public/data/odds.json', ROOT), 'utf8'),
) as OddsFeed
const consensusFeed = JSON.parse(
  await readFile(new URL('src/data/consensus.json', ROOT), 'utf8'),
) as ConsensusFeed
const history = JSON.parse(
  await readFile(new URL('src/data/recommendation-history.json', ROOT), 'utf8'),
) as RecommendationHistory
const weatherHistory = JSON.parse(
  await readFile(new URL('src/data/weather-history.json', ROOT), 'utf8'),
) as WeatherHistoryFile
const teamRoster = JSON.parse(
  await readFile(new URL('src/data/team-roster.json', ROOT), 'utf8'),
) as TeamRosterFile
const nflStarterInjuries = JSON.parse(
  await readFile(new URL('src/data/nfl-starter-injuries.json', ROOT), 'utf8'),
) as NflStarterInjuryFile
const playerHistory = JSON.parse(
  await readFile(new URL('src/data/player-history.json', ROOT), 'utf8'),
) as PlayerHistory
const lineHistory = JSON.parse(
  await readFile(new URL('src/data/line-history.json', ROOT), 'utf8'),
) as LineHistory

let forecasts: PredictionForecasts | null = null
try {
  forecasts = JSON.parse(
    await readFile(new URL('src/data/prediction-forecasts.json', ROOT), 'utf8'),
  ) as PredictionForecasts
} catch {
  // Pool expected stays empty until forecasts exist.
}

let lastKickoff: LastKickoffFile | null = null
try {
  lastKickoff = JSON.parse(
    await readFile(new URL('src/data/last-kickoff.json', ROOT), 'utf8'),
  ) as LastKickoffFile
} catch {
  // Rest stays card-only until the first schedule snapshot.
}

let file: NeutralBriefsFile = emptyNeutralBriefs()
try {
  file = JSON.parse(await readFile(OUTPUT, 'utf8')) as NeutralBriefsFile
  file = {
    updatedAt: file.updatedAt ?? null,
    games: Array.isArray(file.games) ? file.games : [],
  }
} catch {
  // First freeze.
}

const travelRestIndex = buildTravelRestIndex(slate, history, lastKickoff)
const travelRestByEvent = travelRestIndex.byEvent
const lineByEvent = lineHistoryByEvent(
  lineHistory,
  slate.week.order,
  slate.pool.seasonYear,
)
const poolByEvent = poolSupportProjectionsForWeek(
  playerHistory,
  history,
  forecasts,
  slate.week.order,
  travelRestIndex.byAppearance,
)
const injuriesByAbbrev = new Map(
  (nflStarterInjuries.teams ?? []).map((team) => [team.abbrev, team]),
)
const weatherByEvent = new Map(
  (weatherHistory.games ?? [])
    .filter((game) => game.seasonYear === slate.pool.seasonYear)
    .map((game) => [game.cbsEventId, game]),
)
const consensusByEvent = new Map(
  consensusFeed.week?.order === slate.week.order
    ? (consensusFeed.games ?? []).map((game) => [game.cbsEventId, game])
    : [],
)
const oddsById = new Map(
  (odds.events ?? []).map((event) => [event.cbsEventId, event]),
)
const directory = buildTeamDirectory(
  slate,
  history,
  weatherHistory,
  lastKickoff,
  teamRoster,
)
const teamsByKey = new Map(directory.teams.map((team) => [team.key, team]))

const now = Date.now()
const upcoming = slate.games
  .filter((game) => gameIsUpcoming(game, now))
  .map((game) =>
    analyzeGame(
      game,
      oddsById.get(game.cbsEventId),
      consensusByEvent.get(game.cbsEventId),
    ),
  )
const card = generateSuggestedCard(
  upcoming,
  slate.week,
  slate.pool.seasonYear,
  slate.tiebreaker,
  new Date(),
  travelRestByEvent,
  injuriesByAbbrev,
)

const pickById = new Map(card.picks.map((pick) => [pick.gameId, pick]))
const unpickedById = new Map(card.unpicked.map((game) => [game.gameId, game]))
const priced = upcoming.filter((row) => row.category !== 'pending')
const analysisById = new Map(priced.map((row) => [row.game.id, row]))
const candidates = priced.map((row) => ({
  gameId: row.game.id,
  cbsEventId: row.game.cbsEventId,
  kickoff: row.game.kickoff,
  leftover: unpickedById.has(row.game.id),
  brief: lookupNeutralBrief(
    file,
    { gameId: row.game.id },
    slate.week.order,
    slate.pool.seasonYear,
  ),
}))
const gameDay = candidates.filter((row) => isScoutGameDay(row.kickoff, now))
const queue = selectGameDayScoutAsks(candidates, ASK_LIMIT, now, FORCE)

let wrote = 0
let failed = 0

if (queue.length > 0 && !SCOUT.ok) {
  console.log(`::error title=Missing scout key::${SCOUT.error}`)
  process.exit(1)
}

const scout = SCOUT.ok ? SCOUT.config : null
const scoutPrompt = (await readFile(PROMPT_FILE, 'utf8')).trim()
if (scout) {
  console.log(`Scout provider ${scout.provider} (${scout.model})`)
}

for (const item of queue) {
  const analysis = analysisById.get(item.gameId)
  if (!analysis) continue
  const pick = pickById.get(item.gameId)
  const unpicked = unpickedById.get(item.gameId)
  const cardPick: NeutralCardPick | null = pick
    ? {
        side: pick.pickedSide,
        team: pick.pickedTeam,
        spread: pick.poolSpread,
        detail: pick.detail,
        source: pick.source,
      }
    : null

  const packet = buildNeutralPacket({
    analysis,
    unpicked,
    cardPick,
    week: slate.week,
    seasonYear: slate.pool.seasonYear,
    awayTeam: teamsByKey.get(teamKey(analysis.game.sport, analysis.game.away.abbrev)) ?? null,
    homeTeam: teamsByKey.get(teamKey(analysis.game.sport, analysis.game.home.abbrev)) ?? null,
    travelRest: travelRestByEvent.get(analysis.game.cbsEventId),
    weather: weatherByEvent.get(analysis.game.cbsEventId) ?? null,
    injuries:
      analysis.game.sport === 'NFL'
        ? {
            away: injuriesByAbbrev.get(analysis.game.away.abbrev),
            home: injuriesByAbbrev.get(analysis.game.home.abbrev),
          }
        : undefined,
    lineTicks: ticksEndingAtLive(
      lineByEvent.get(analysis.game.cbsEventId)?.ticks ?? [],
      analysis.odds?.lines.draftkings,
    ),
    pool: poolByEvent.get(analysis.game.cbsEventId) ?? null,
  })

  try {
    if (!scout) continue
    const answer =
      scout.provider === 'cursor'
        ? await askCursor(packet, scout, scoutPrompt)
        : await askScout(packet, scout, scoutPrompt)
    const frozenAt = new Date().toISOString()
    const result = freezeNeutralBrief(
      file,
      {
        status: 'ok',
        gameId: analysis.game.id,
        cbsEventId: analysis.game.cbsEventId,
        week: slate.week.order,
        seasonYear: slate.pool.seasonYear,
        away: analysis.game.away.name,
        home: analysis.game.home.name,
        side: answer.side,
        confidence: answer.confidence,
        why: answer.why,
        model: `${scout.provider}:${scout.model}`,
        frozenAt,
      },
      FORCE,
    )
    file = result.file
    if (result.wrote) wrote += 1
    console.log(
      `wrote ${analysis.game.away.name} @ ${analysis.game.home.name}: ${answer.side} ${answer.confidence}`,
    )
  } catch (error) {
    failed += 1
    const message = error instanceof Error ? error.message : String(error)
    console.log(
      `::warning title=Scout brief failed::${analysis.game.away.name} @ ${analysis.game.home.name}: ${message}`,
    )
    const result = freezeNeutralBrief(file, {
      status: 'failed',
      gameId: analysis.game.id,
      cbsEventId: analysis.game.cbsEventId,
      week: slate.week.order,
      seasonYear: slate.pool.seasonYear,
      away: analysis.game.away.name,
      home: analysis.game.home.name,
      error: summarizeGeminiError(message),
      model: scout ? `${scout.provider}:${scout.model}` : 'unconfigured',
      attemptedAt: new Date().toISOString(),
    })
    file = result.file
    if (result.wrote) wrote += 1
  }
  if (queue.indexOf(item) < queue.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
}

if (wrote > 0) {
  await writeFile(OUTPUT, `${JSON.stringify(file, null, 2)}\n`)
}

console.log(
  `Scout notes: ${wrote} wrote, ${failed} failed, asked ${queue.length} of ${gameDay.length} game-day games (${card.unpicked.length} leftovers first, then recs).`,
)
