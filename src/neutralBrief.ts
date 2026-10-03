import { formatPoolSpread, poolSpreadForSide } from './cardScoring.ts'
import { buildTeamProfile } from './teamProfile.ts'
import {
  summarizeAppearances,
  type TeamAppearance,
  type TeamRecord,
  type TeamSplit,
} from './teamPerformance.ts'
import { type GameTravelRest } from './travelRest.ts'
import { formatWeatherBucket, type FrozenWeather } from './weatherBuckets.ts'
import {
  NFL_AVAILABILITY_LABELS,
  type NflStarterInjuryTeam,
} from './nflStarterInjuries.ts'
import type { GameAnalysis, SlateGame } from './types.ts'
import type { UnpickedGame } from './cardStrategy.ts'

/** Free-tier Flash for new AI Studio keys. Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
export const NEUTRAL_BRIEF_RECENT_COVERS = 4
export const NEUTRAL_BRIEF_MAX_WHY = 480

export type NeutralBriefSide = 'home' | 'away' | 'no-call'
export type NeutralBriefConfidence = 'light' | 'medium' | 'strong'

export type NeutralBrief = {
  gameId: string
  cbsEventId: number
  week: number
  seasonYear: number
  away: string
  home: string
  side: NeutralBriefSide
  confidence: NeutralBriefConfidence
  why: string
  model: string
  frozenAt: string
}

export type NeutralBriefsFile = {
  updatedAt: string | null
  games: NeutralBrief[]
}

export type NeutralPacketCover = {
  week: number
  opponent: string
  site: string
  market: string
  result: string
  teamSpread: number
}

export type NeutralPacketTeam = {
  side: 'home' | 'away'
  name: string
  abbrev: string
  poolSpread: number
  ats: string
  profile: {
    archetype: string
    detail: string
    insight: string | null
    decided: number
  }
  rest: string | null
  travel: string | null
  injuries: string[]
  recentCovers: NeutralPacketCover[]
}

export type NeutralPacket = {
  week: number
  weekLabel: string
  seasonYear: number
  sport: 'NFL' | 'NCAAF'
  gameId: string
  cbsEventId: number
  kickoff: string
  away: string
  home: string
  venue: string | null
  cbsHomeSpread: number
  dkHomeSpread: number | null
  lineEdge: number | null
  skipReason: string
  lean: { side: 'home' | 'away'; team: string; spread: number } | null
  cardDetail: string | null
  weather: string | null
  public: { awayPct: number | null; homePct: number | null } | null
  teams: NeutralPacketTeam[]
}

export type NeutralTeamSource = Pick<
  TeamRecord,
  'name' | 'abbrev' | 'appearances'
> & {
  overall?: TeamSplit
}

const SIDES: readonly NeutralBriefSide[] = ['home', 'away', 'no-call']
const CONFIDENCES: readonly NeutralBriefConfidence[] = [
  'light',
  'medium',
  'strong',
]

export function emptyNeutralBriefs(): NeutralBriefsFile {
  return { updatedAt: null, games: [] }
}

export function briefKey(
  seasonYear: number,
  week: number,
  gameId: string,
) {
  return `${seasonYear}:${week}:${gameId}`
}

export function lookupNeutralBrief(
  file: NeutralBriefsFile | null | undefined,
  game: { gameId: string; week?: number },
  week: number,
  seasonYear: number,
): NeutralBrief | null {
  const gameId = game.gameId
  const poolWeek = game.week ?? week
  return (
    file?.games.find(
      (row) =>
        row.gameId === gameId &&
        row.week === poolWeek &&
        row.seasonYear === seasonYear,
    ) ?? null
  )
}

export function freezeNeutralBrief(
  file: NeutralBriefsFile,
  next: NeutralBrief,
  force = false,
): { file: NeutralBriefsFile; wrote: boolean } {
  const existing = file.games.find(
    (row) =>
      row.gameId === next.gameId &&
      row.week === next.week &&
      row.seasonYear === next.seasonYear,
  )
  if (existing && !force) {
    return { file, wrote: false }
  }
  const games = [
    ...file.games.filter(
      (row) =>
        !(
          row.gameId === next.gameId &&
          row.week === next.week &&
          row.seasonYear === next.seasonYear
        ),
    ),
    next,
  ].sort(
    (left, right) =>
      left.seasonYear - right.seasonYear ||
      left.week - right.week ||
      left.cbsEventId - right.cbsEventId,
  )
  return {
    file: { updatedAt: next.frozenAt, games },
    wrote: true,
  }
}

export function parseGeminiBrief(raw: unknown): {
  side: NeutralBriefSide
  confidence: NeutralBriefConfidence
  why: string
} | null {
  const value = unwrapGeminiJson(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const side = text(row.side)?.toLowerCase()
  const confidence = text(row.confidence)?.toLowerCase()
  const why = clipWhy(text(row.why))
  if (!side || !isBriefSide(side)) return null
  if (!confidence || !isBriefConfidence(confidence)) return null
  if (!why) return null
  return { side, confidence, why }
}

export const NEUTRAL_BRIEF_SYSTEM_PROMPT = `You are reviewing one leftover CBS Football Pick'em game. The card already left it unpicked because line, hook, injury, rest, and travel produced no net of 0.25 or more. You do not replace that card and you do not send picks.

Use only the packet. Do not invent injuries, weather, records, or lines. If a fact is missing, treat it as unknown.

Return JSON only:
{"side":"home"|"away"|"no-call","confidence":"light"|"medium"|"strong","why":"..."}

Rules:
- side is the CBS pool side you would take, or no-call if the packet does not support a lean.
- light if decided < 4 on the profiles you cite, or if you only have one thin fact.
- medium if two packet facts point the same way.
- strong only if multiple packet facts agree and samples are not thin.
- why: 2-4 sentences quoting packet facts (ATS line, rest, travel, weather, profile, injuries). No fluff.
- If the packet is empty of directional facts, return no-call with light.`

export function buildNeutralPacket(input: {
  analysis: GameAnalysis
  unpicked: UnpickedGame
  week: { order: number; label: string }
  seasonYear: number
  awayTeam: NeutralTeamSource | null
  homeTeam: NeutralTeamSource | null
  travelRest?: GameTravelRest
  weather?: FrozenWeather | null
  injuries?: {
    away?: NflStarterInjuryTeam
    home?: NflStarterInjuryTeam
  }
}): NeutralPacket {
  const { analysis, unpicked, week, seasonYear } = input
  const game = analysis.game
  const names = { away: game.away.name, home: game.home.name }
  const restTravel = input.travelRest
  const lean =
    unpicked.leanSide && unpicked.leanTeam && unpicked.leanSpread != null
      ? {
          side: unpicked.leanSide,
          team: unpicked.leanTeam,
          spread: unpicked.leanSpread,
        }
      : null

  return {
    week: week.order,
    weekLabel: week.label,
    seasonYear,
    sport: game.sport,
    gameId: game.id,
    cbsEventId: game.cbsEventId,
    kickoff: game.kickoff,
    away: game.away.name,
    home: game.home.name,
    venue: venueLine(game),
    cbsHomeSpread: game.homeSpread,
    dkHomeSpread: analysis.liveHomeSpread,
    lineEdge:
      analysis.liveHomeSpread != null
        ? roundToHundredth(game.homeSpread - analysis.liveHomeSpread)
        : null,
    skipReason: unpicked.reason,
    lean,
    cardDetail: unpicked.detail ?? null,
    weather: weatherLine(input.weather ?? null),
    public: publicLine(analysis),
    teams: [
      packetTeam({
        side: 'away',
        game,
        source: input.awayTeam,
        travelRest: restTravel,
        names,
        injuries: input.injuries?.away,
      }),
      packetTeam({
        side: 'home',
        game,
        source: input.homeTeam,
        travelRest: restTravel,
        names,
        injuries: input.injuries?.home,
      }),
    ],
  }
}

export function formatNeutralBriefTag(
  brief: NeutralBrief,
  game: Pick<UnpickedGame, 'away' | 'home' | 'homeSpread'>,
) {
  if (brief.side === 'no-call') {
    return `Gemini · no call · ${brief.confidence}`
  }
  const team = brief.side === 'home' ? game.home : game.away
  const spread = poolSpreadForSide(game.homeSpread, brief.side)
  return `Gemini · ${team} ${formatPoolSpread(spread)} · ${brief.confidence}`
}

function packetTeam(input: {
  side: 'home' | 'away'
  game: SlateGame
  source: NeutralTeamSource | null
  travelRest?: GameTravelRest
  names: { away: string; home: string }
  injuries?: NflStarterInjuryTeam
}): NeutralPacketTeam {
  const team = input.game[input.side]
  const appearances = input.source?.appearances ?? []
  const overall =
    input.source?.overall ?? summarizeAppearances(appearances)
  const profile = buildTeamProfile({ appearances })
  return {
    side: input.side,
    name: input.source?.name ?? team.name,
    abbrev: input.source?.abbrev ?? team.abbrev,
    poolSpread: poolSpreadForSide(input.game.homeSpread, input.side),
    ats: overall.detail,
    profile: {
      archetype: profile.archetype,
      detail: profile.archetypeDetail,
      insight: profile.insight,
      decided: profile.decided,
    },
    rest: sideRestLabel(input.travelRest, input.side, input.names[input.side]),
    travel: sideTravelLabel(
      input.travelRest,
      input.side,
      input.names[input.side],
    ),
    injuries: injuryLines(input.injuries),
    recentCovers: recentCovers(appearances),
  }
}

function recentCovers(appearances: TeamAppearance[]): NeutralPacketCover[] {
  return [...appearances]
    .filter((row) => row.result === 'win' || row.result === 'loss' || row.result === 'push')
    .sort(
      (left, right) =>
        right.week - left.week || right.cbsEventId - left.cbsEventId,
    )
    .slice(0, NEUTRAL_BRIEF_RECENT_COVERS)
    .map((row) => ({
      week: row.week,
      opponent: row.opponent,
      site: row.venue,
      market: row.market,
      result: row.result ?? 'pending',
      teamSpread: poolSpreadForSide(row.homeSpread, row.side),
    }))
}

function injuryLines(team: NflStarterInjuryTeam | undefined) {
  if (!team || team.status !== 'ok') return []
  return team.injuries.slice(0, 6).map((row) => {
    const label = NFL_AVAILABILITY_LABELS[row.tier]
    const note = row.injury ?? row.detail
    return note
      ? `${row.name} ${row.position} ${label} — ${note}`
      : `${row.name} ${row.position} ${label}`
  })
}

function weatherLine(weather: FrozenWeather | null) {
  const bucket = formatWeatherBucket(weather)
  if (!weather || !bucket) return null
  const extras = [
    weather.temperature != null ? `${weather.temperature}°F` : null,
    weather.windSpeed,
    weather.precipChance != null ? `${weather.precipChance}% precip` : null,
    weather.shortForecast,
  ].filter((part): part is string => Boolean(part))
  return extras.length ? `${bucket} (${extras.join(', ')})` : bucket
}

function publicLine(analysis: GameAnalysis) {
  const consensus = analysis.consensus
  if (!consensus) return null
  if (consensus.away.pct == null && consensus.home.pct == null) return null
  return {
    awayPct: consensus.away.pct,
    homePct: consensus.home.pct,
  }
}

function venueLine(game: SlateGame) {
  const venue = game.venue
  if (!venue) return null
  const place = [venue.city, venue.state].filter(Boolean).join(', ')
  const parts = [
    venue.stadium,
    place,
    venue.indoor ? 'indoor' : null,
  ].filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(' · ') : null
}

function sideRestLabel(
  row: GameTravelRest | undefined,
  side: 'home' | 'away',
  name: string,
) {
  const rest = side === 'away' ? row?.awayRest : row?.homeRest
  if (!rest) return null
  const where = rest.lastGameAt ? ` · last game at ${rest.lastGameAt}` : ''
  const trip = rest.priorTravel
    ? ` · after traveling ${rest.priorTravel.label}`
    : ''
  return `${name} ${rest.label}${where}${trip}`
}

function sideTravelLabel(
  row: GameTravelRest | undefined,
  side: 'home' | 'away',
  name: string,
) {
  const travel = side === 'away' ? row?.awayTravel : row?.homeTravel
  if (!travel || travel.direction === 'same') return null
  return `${name} traveling ${travel.label}`
}

function unwrapGeminiJson(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const row = raw as Record<string, unknown>
    if ('side' in row || 'confidence' in row || 'why' in row) return raw
  }
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const text = (fenced?.[1] ?? trimmed).trim()
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function clipWhy(value: string | null) {
  if (!value) return null
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return null
  if (compact.length <= NEUTRAL_BRIEF_MAX_WHY) return compact
  const sliced = compact.slice(0, NEUTRAL_BRIEF_MAX_WHY)
  const sentence = sliced.match(/^[\s\S]*[.!?](?=\s|$)/)
  return (sentence?.[0] ?? sliced).trim()
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isBriefSide(value: string): value is NeutralBriefSide {
  return (SIDES as readonly string[]).includes(value)
}

function isBriefConfidence(value: string): value is NeutralBriefConfidence {
  return (CONFIDENCES as readonly string[]).includes(value)
}

function roundToHundredth(value: number) {
  return Math.round(value * 100) / 100
}
