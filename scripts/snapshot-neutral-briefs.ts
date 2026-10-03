import { readFile, writeFile } from 'node:fs/promises'
import { generateSuggestedCard } from '../src/cardStrategy.ts'
import { classifyEdge } from '../src/cardScoring.ts'
import { gameIsUpcoming } from '../src/gameStatus.ts'
import { buildTeamDirectory, teamKey } from '../src/teamPerformance.ts'
import { buildTravelRestIndex } from '../src/travelRest.ts'
import type { LastKickoffFile } from '../src/lastKickoff.ts'
import type { WeatherHistoryFile } from '../src/weatherBuckets.ts'
import type { TeamRosterFile } from '../src/teamRoster.ts'
import type { NflStarterInjuryFile } from '../src/nflStarterInjuries.ts'
import type {
  ConsensusFeed,
  GameAnalysis,
  OddsEvent,
  OddsFeed,
  RecommendationHistory,
  Slate,
  SlateGame,
} from '../src/types.ts'
import {
  DEFAULT_GEMINI_MODEL,
  NEUTRAL_BRIEF_SYSTEM_PROMPT,
  buildNeutralPacket,
  emptyNeutralBriefs,
  freezeNeutralBrief,
  isNeutralBriefOk,
  lookupNeutralBrief,
  parseGeminiBrief,
  summarizeGeminiError,
  type NeutralBriefsFile,
  type NeutralPacket,
} from '../src/neutralBrief.ts'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/neutral-briefs.json', ROOT)
const FORCE = process.argv.includes('--force')
const MODEL = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
const API_KEY = process.env.GEMINI_API_KEY?.trim() ?? ''

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

const GEMINI_RETRY_STATUSES = new Set([429, 503])
const GEMINI_ATTEMPTS = 4

async function askGeminiOnce(packet: NeutralPacket) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: NEUTRAL_BRIEF_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Packet:\n${JSON.stringify(packet, null, 2)}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            side: { type: 'string', enum: ['home', 'away', 'no-call'] },
            confidence: { type: 'string', enum: ['light', 'medium', 'strong'] },
            why: { type: 'string' },
          },
          required: ['side', 'confidence', 'why'],
        },
      },
    }),
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${body.slice(0, 400)}`)
  }
  const payload = JSON.parse(body) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()
  const parsed = parseGeminiBrief(text)
  if (!parsed) {
    throw new Error(`Gemini returned an unreadable brief: ${text?.slice(0, 240) ?? body.slice(0, 240)}`)
  }
  return parsed
}

async function askGemini(packet: NeutralPacket) {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= GEMINI_ATTEMPTS; attempt += 1) {
    try {
      return await askGeminiOnce(packet)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const status = Number(/Gemini (\d+)/.exec(lastError.message)?.[1])
      if (!GEMINI_RETRY_STATUSES.has(status) || attempt === GEMINI_ATTEMPTS) {
        throw lastError
      }
      const waitMs = 4000 * 2 ** (attempt - 1)
      console.log(
        `::warning title=Gemini busy::retry ${attempt}/${GEMINI_ATTEMPTS} in ${waitMs / 1000}s — ${lastError.message.slice(0, 160)}`,
      )
      await sleep(waitMs)
    }
  }
  throw lastError ?? new Error('Gemini failed')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

const travelRestByEvent = buildTravelRestIndex(
  slate,
  history,
  lastKickoff,
).byEvent
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

const leftovers = card.unpicked.filter((game) => {
  const analysis = upcoming.find((row) => row.game.id === game.gameId)
  return analysis?.category !== 'pending'
})

let wrote = 0
let skipped = 0
let failed = 0

for (const unpicked of leftovers) {
  const existing = lookupNeutralBrief(
    file,
    unpicked,
    slate.week.order,
    slate.pool.seasonYear,
  )
  if (existing && isNeutralBriefOk(existing) && !FORCE) {
    skipped += 1
    continue
  }

  if (!API_KEY) {
    console.log(
      '::error title=Missing GEMINI_API_KEY::Add the GitHub Actions secret GEMINI_API_KEY from https://aistudio.google.com/apikey',
    )
    process.exit(1)
  }

  const analysis = upcoming.find((row) => row.game.id === unpicked.gameId)
  if (!analysis) {
    skipped += 1
    continue
  }

  const packet = buildNeutralPacket({
    analysis,
    unpicked,
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
  })

  try {
    const answer = await askGemini(packet)
    const frozenAt = new Date().toISOString()
    const result = freezeNeutralBrief(
      file,
      {
        status: 'ok',
        gameId: unpicked.gameId,
        cbsEventId: unpicked.cbsEventId,
        week: slate.week.order,
        seasonYear: slate.pool.seasonYear,
        away: unpicked.away,
        home: unpicked.home,
        side: answer.side,
        confidence: answer.confidence,
        why: answer.why,
        model: MODEL,
        frozenAt,
      },
      FORCE,
    )
    file = result.file
    if (result.wrote) wrote += 1
    else skipped += 1
    console.log(
      `froze ${unpicked.away} @ ${unpicked.home}: ${answer.side} ${answer.confidence}`,
    )
    if (leftovers.indexOf(unpicked) < leftovers.length - 1) {
      await sleep(1500)
    }
  } catch (error) {
    failed += 1
    const message = error instanceof Error ? error.message : String(error)
    console.log(`::warning title=Gemini brief failed::${unpicked.away} @ ${unpicked.home}: ${message}`)
    const result = freezeNeutralBrief(file, {
      status: 'failed',
      gameId: unpicked.gameId,
      cbsEventId: unpicked.cbsEventId,
      week: slate.week.order,
      seasonYear: slate.pool.seasonYear,
      away: unpicked.away,
      home: unpicked.home,
      error: summarizeGeminiError(message),
      model: MODEL,
      attemptedAt: new Date().toISOString(),
    })
    file = result.file
    if (result.wrote) wrote += 1
  }
}

if (wrote > 0) {
  await writeFile(OUTPUT, `${JSON.stringify(file, null, 2)}\n`)
}

console.log(
  `Neutral briefs: ${wrote} wrote, ${skipped} already frozen, ${failed} failed, ${leftovers.length} leftovers (${card.unpicked.length} unpicked).`,
)
