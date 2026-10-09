import { formatPoolSpread, poolSpreadForSide } from './cardScoring.ts'
import { formatLinePath } from './lineHistory.ts'
import { buildTeamProfile } from './teamProfile.ts'
import {
  summarizeAppearances,
  type TeamAppearance,
  type TeamRecord,
  type TeamSplit,
} from './teamPerformance.ts'
import {
  restSplitKey,
  travelSplitKey,
  type GameTravelRest,
  type RestSplitKey,
  type TravelSplitKey,
} from './travelRest.ts'
import {
  formatWeatherBucket,
  isColdTemp,
  isHotTemp,
  type FrozenWeather,
} from './weatherBuckets.ts'
import {
  NFL_AVAILABILITY_LABELS,
  type NflStarterInjuryTeam,
} from './nflStarterInjuries.ts'
import { etDayKey } from './gameStatus.ts'
import type { GameAnalysis, SlateGame } from './types.ts'
import type { SuggestedPick, UnpickedGame } from './cardStrategy.ts'

/** Override with GEMINI_MODEL. Use a paid Pro model once GEMINI_API_KEY is paid. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
export const NEUTRAL_BRIEF_RECENT_COVERS = 8
export const NEUTRAL_BRIEF_MAX_WHY = 900
/** Game-day budget: leftovers first, then recs still missing a same-day note. */
export const GEMINI_ASK_BUDGET = 6

export type NeutralBriefSide = 'home' | 'away' | 'no-call'
export type NeutralBriefConfidence = 'light' | 'medium' | 'strong'

export type NeutralBriefBase = {
  gameId: string
  cbsEventId: number
  week: number
  seasonYear: number
  away: string
  home: string
  model: string
}

export type NeutralBriefOk = NeutralBriefBase & {
  status?: 'ok'
  side: NeutralBriefSide
  confidence: NeutralBriefConfidence
  why: string
  frozenAt: string
}

export type NeutralBriefFailed = NeutralBriefBase & {
  status: 'failed'
  error: string
  attemptedAt: string
}

export type NeutralBrief = NeutralBriefOk | NeutralBriefFailed

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

export type NeutralPacketSplit = {
  games: number
  detail: string
  rate: string
}

export type NeutralPacketSituation = {
  role: string
  site: string | null
  market: string | null
  rest: { kind: string; ats: string } | null
  travel: { kind: string; ats: string } | null
  weather: Array<{ kind: string; ats: string }>
}

export type NeutralPacketTeam = {
  side: 'home' | 'away'
  name: string
  abbrev: string
  conference: string | null
  rank: number | null
  poolSpread: number
  role: string
  ats: string
  splits: Record<string, string>
  situation: NeutralPacketSituation
  vsOpponent: NeutralPacketCover[]
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

export type NeutralPacketPool = {
  home: number
  away: number
  unknown: number
  called: number
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
  linePath: string | null
  skipReason: string | null
  lean: { side: 'home' | 'away'; team: string; spread: number } | null
  cardPick: NeutralCardPick | null
  cardDetail: string | null
  weather: string | null
  public: { awayPct: number | null; homePct: number | null } | null
  pool: NeutralPacketPool | null
  teams: NeutralPacketTeam[]
}

export type NeutralCardPick = {
  side: 'home' | 'away'
  team: string
  spread: number
  detail: string | null
  source: string
}

export type GeminiAskCandidate = {
  gameId: string
  cbsEventId: number
  brief: NeutralBrief | null
  leftover?: boolean
  kickoff?: string
}

export type NeutralTeamSource = Pick<
  TeamRecord,
  'name' | 'abbrev' | 'appearances'
> &
  Partial<
    Pick<
      TeamRecord,
      | 'conference'
      | 'rank'
      | 'overall'
      | 'home'
      | 'away'
      | 'neutral'
      | 'favorite'
      | 'dog'
      | 'dogOutright'
      | 'benign'
      | 'adverse'
      | 'wet'
      | 'windy'
      | 'hot'
      | 'cold'
      | 'indoor'
      | 'oneZone'
      | 'twoZones'
      | 'threePlus'
      | 'shortRest'
      | 'normalRest'
      | 'longRest'
      | 'byeRest'
    >
  >

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

export function isNeutralBriefFailed(
  brief: NeutralBrief | null | undefined,
): brief is NeutralBriefFailed {
  return brief?.status === 'failed'
}

export function isNeutralBriefOk(
  brief: NeutralBrief | null | undefined,
): brief is NeutralBriefOk {
  return brief != null && brief.status !== 'failed'
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

export function summarizeGeminiError(message: string) {
  const status = /(?:Gemini|OpenAI|Anthropic|Cursor|Scout) (\d+)/.exec(message)?.[1]
  if (status === '503' || status === '529') return '503 high demand'
  if (status === '429') return '429 rate limit'
  if (status === '404') return '404 model not found'
  const compact = message.replace(/\s+/g, ' ').trim()
  return compact.slice(0, 120) || 'Scout request failed'
}

export function formatNeutralBriefFailure(brief: NeutralBriefFailed) {
  if (brief.error.startsWith('503')) {
    return 'Scout was busy (503). The next scout run will try this game again.'
  }
  if (brief.error.startsWith('429')) {
    return 'Scout hit a rate limit. The next scout run will try this game again.'
  }
  return `Scout failed (${brief.error}). The next scout run will try this game again.`
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
  if (existing && isNeutralBriefOk(existing) && isNeutralBriefFailed(next) && !force) {
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
    file: { updatedAt: briefStamp(next), games },
    wrote: true,
  }
}

function briefStamp(brief: NeutralBrief) {
  return isNeutralBriefFailed(brief) ? brief.attemptedAt : brief.frozenAt
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

/** Edit `src/data/leftover-scout-prompt.md` — that file is what the Action sends. */
export const NEUTRAL_BRIEF_PROMPT_FILE = 'src/data/leftover-scout-prompt.md'

export function buildNeutralPacket(input: {
  analysis: GameAnalysis
  unpicked?: UnpickedGame | null
  cardPick?: NeutralCardPick | null
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
  lineTicks?: Array<{ home: number }>
  pool?: NeutralPacketPool | null
}): NeutralPacket {
  const { analysis, unpicked, week, seasonYear } = input
  const game = analysis.game
  const names = { away: game.away.name, home: game.home.name }
  const restTravel = input.travelRest
  const cardPick = input.cardPick ?? null
  const lean =
    unpicked?.leanSide && unpicked.leanTeam && unpicked.leanSpread != null
      ? {
          side: unpicked.leanSide,
          team: unpicked.leanTeam,
          spread: unpicked.leanSpread,
        }
      : cardPick
        ? { side: cardPick.side, team: cardPick.team, spread: cardPick.spread }
        : null
  const awayOpponent = {
    name: input.homeTeam?.name ?? game.home.name,
    abbrev: input.homeTeam?.abbrev ?? game.home.abbrev,
  }
  const homeOpponent = {
    name: input.awayTeam?.name ?? game.away.name,
    abbrev: input.awayTeam?.abbrev ?? game.away.abbrev,
  }

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
    linePath: formatLinePath(
      (input.lineTicks ?? []).map((tick) => tick.home),
      formatPoolSpread,
    ),
    skipReason: unpicked?.reason ?? null,
    lean,
    cardPick,
    cardDetail: cardPick?.detail ?? unpicked?.detail ?? null,
    weather: weatherLine(input.weather ?? null),
    public: publicLine(analysis),
    pool: input.pool ?? null,
    teams: [
      packetTeam({
        side: 'away',
        game,
        source: input.awayTeam,
        travelRest: restTravel,
        names,
        opponent: awayOpponent,
        injuries: input.injuries?.away,
        weather: input.weather ?? null,
      }),
      packetTeam({
        side: 'home',
        game,
        source: input.homeTeam,
        travelRest: restTravel,
        names,
        opponent: homeOpponent,
        injuries: input.injuries?.home,
        weather: input.weather ?? null,
      }),
    ],
  }
}

export function formatNeutralBriefTag(
  brief: NeutralBrief,
  game: Pick<UnpickedGame, 'away' | 'home' | 'homeSpread'>,
) {
  if (isNeutralBriefFailed(brief)) return 'Scout failed · try again'
  if (brief.side === 'no-call') {
    return `Scout · no call · ${brief.confidence}`
  }
  const team = brief.side === 'home' ? game.home : game.away
  const spread = poolSpreadForSide(game.homeSpread, brief.side)
  return `Scout · ${team} ${formatPoolSpread(spread)} · ${brief.confidence}`
}

export function formatGeminiPickTag(
  brief: NeutralBrief,
  pick: Pick<SuggestedPick, 'away' | 'home' | 'pickedSide' | 'poolSpread'>,
) {
  if (isNeutralBriefFailed(brief)) return 'Scout failed · try again'
  if (brief.side === 'no-call') {
    return `Gemini · no call · ${brief.confidence}`
  }
  const team = brief.side === 'home' ? pick.home : pick.away
  const homeSpread =
    pick.pickedSide === 'home' ? pick.poolSpread : -pick.poolSpread
  const spread = poolSpreadForSide(homeSpread, brief.side)
  if (brief.side === pick.pickedSide) {
    return `Gemini agrees · ${brief.confidence}`
  }
  return `Gemini leans ${team} ${formatPoolSpread(spread)} · ${brief.confidence}`
}

export function isScoutGameDay(
  kickoff: string,
  now: Date | number = Date.now(),
) {
  const gameDay = etDayKey(kickoff)
  const today = etDayKey(now instanceof Date ? now.getTime() : now)
  return Boolean(gameDay && today && gameDay === today)
}

export function isGameDayFreshNote(
  brief: NeutralBrief | null | undefined,
  kickoff: string,
) {
  if (!brief || isNeutralBriefFailed(brief)) return false
  const written = etDayKey(brief.frozenAt)
  const gameDay = etDayKey(kickoff)
  return Boolean(written && gameDay && written === gameDay)
}

export function selectGamesToAsk(
  candidates: GeminiAskCandidate[],
  budget = GEMINI_ASK_BUDGET,
  leftoversOnly = false,
) {
  const pool = leftoversOnly
    ? candidates.filter((row) => row.leftover)
    : candidates
  return [...pool]
    .sort((left, right) => {
      const rank = askRank(left) - askRank(right)
      if (rank) return rank
      const stamp = askStamp(left) - askStamp(right)
      if (stamp) return stamp
      return left.cbsEventId - right.cbsEventId
    })
    .slice(0, Math.max(0, budget))
}

/** Upcoming priced games whose ET kickoff is today and still need a same-day note. */
export function selectGameDayScoutAsks(
  candidates: Array<GeminiAskCandidate & { kickoff: string }>,
  budget = GEMINI_ASK_BUDGET,
  now: Date | number = Date.now(),
  includeFresh = false,
) {
  const pool = candidates.filter((row) => {
    if (!isScoutGameDay(row.kickoff, now)) return false
    if (includeFresh) return true
    return !isGameDayFreshNote(row.brief, row.kickoff)
  })
  return selectGamesToAsk(pool, budget, false)
}

function askRank(row: GeminiAskCandidate) {
  // Recs sort after leftovers. Each bucket is missing < failed < oldest note.
  const leftoverBoost = row.leftover === false ? 3 : 0
  if (!row.brief) return leftoverBoost
  if (isNeutralBriefFailed(row.brief)) return leftoverBoost + 1
  return leftoverBoost + 2
}

function askStamp(row: GeminiAskCandidate) {
  if (!row.brief) return 0
  if (isNeutralBriefFailed(row.brief)) return Date.parse(row.brief.attemptedAt) || 0
  return Date.parse(row.brief.frozenAt) || 0
}

function packetTeam(input: {
  side: 'home' | 'away'
  game: SlateGame
  source: NeutralTeamSource | null
  travelRest?: GameTravelRest
  names: { away: string; home: string }
  opponent: { name: string; abbrev: string }
  injuries?: NflStarterInjuryTeam
  weather?: FrozenWeather | null
}): NeutralPacketTeam {
  const team = input.game[input.side]
  const appearances = input.source?.appearances ?? []
  const splits = resolveSplits(input.source)
  const profile = buildTeamProfile({ appearances })
  const poolSpread = poolSpreadForSide(input.game.homeSpread, input.side)
  const rest =
    input.side === 'away'
      ? input.travelRest?.awayRest
      : input.travelRest?.homeRest
  const travel =
    input.side === 'away'
      ? input.travelRest?.awayTravel
      : input.travelRest?.homeTravel
  const restKey = restSplitKey(rest)
  const travelKey = travelSplitKey(travel)
  return {
    side: input.side,
    name: input.source?.name ?? team.name,
    abbrev: input.source?.abbrev ?? team.abbrev,
    conference: input.source?.conference ?? team.conference ?? null,
    rank: input.source?.rank ?? team.rank ?? null,
    poolSpread,
    role: roleLabel(poolSpread, input.side),
    ats: splits.overall.detail,
    splits: compactSplits(splits),
    situation: {
      role: roleLabel(poolSpread, input.side),
      site: splitLine(input.side === 'home' ? splits.home : splits.away),
      market: splitLine(
        poolSpread > 0
          ? splits.dog
          : poolSpread < 0
            ? splits.favorite
            : null,
      ),
      rest:
        restKey && splitLine(restSplitFor(splits, restKey))
          ? { kind: restKey, ats: splitLine(restSplitFor(splits, restKey))! }
          : null,
      travel:
        travelKey && splitLine(travelSplitFor(splits, travelKey))
          ? {
              kind: travelKey,
              ats: splitLine(travelSplitFor(splits, travelKey))!,
            }
          : null,
      weather: weatherSituation(splits, input.weather ?? null),
    },
    vsOpponent: vsOpponentCovers(appearances, input.opponent),
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

type ResolvedSplits = {
  overall: TeamSplit
  home: TeamSplit
  away: TeamSplit
  neutral: TeamSplit
  favorite: TeamSplit
  dog: TeamSplit
  dogOutright: TeamSplit
  benign: TeamSplit
  adverse: TeamSplit
  wet: TeamSplit
  windy: TeamSplit
  hot: TeamSplit
  cold: TeamSplit
  indoor: TeamSplit
  oneZone: TeamSplit
  twoZones: TeamSplit
  threePlus: TeamSplit
  shortRest: TeamSplit
  normalRest: TeamSplit
  longRest: TeamSplit
  byeRest: TeamSplit
}

function emptySplit(): TeamSplit {
  return summarizeAppearances([])
}

function resolveSplits(source: NeutralTeamSource | null): ResolvedSplits {
  const appearances = source?.appearances ?? []
  return {
    overall: source?.overall ?? summarizeAppearances(appearances),
    home:
      source?.home ??
      summarizeAppearances(appearances, (row) => row.venue === 'home'),
    away:
      source?.away ??
      summarizeAppearances(appearances, (row) => row.venue === 'away'),
    neutral:
      source?.neutral ??
      summarizeAppearances(appearances, (row) => row.venue === 'neutral'),
    favorite:
      source?.favorite ??
      summarizeAppearances(appearances, (row) => row.market === 'favorite'),
    dog:
      source?.dog ??
      summarizeAppearances(appearances, (row) => row.market === 'dog'),
    dogOutright: source?.dogOutright ?? emptySplit(),
    benign:
      source?.benign ??
      summarizeAppearances(
        appearances,
        (row) => row.weather?.bucket === 'benign',
      ),
    adverse:
      source?.adverse ??
      summarizeAppearances(
        appearances,
        (row) => row.weather?.bucket === 'adverse',
      ),
    wet:
      source?.wet ??
      summarizeAppearances(appearances, (row) => row.weather?.wet === true),
    windy:
      source?.windy ??
      summarizeAppearances(appearances, (row) => row.weather?.windy === true),
    hot:
      source?.hot ??
      summarizeAppearances(appearances, (row) =>
        isHotTemp(row.weather?.temperature),
      ),
    cold:
      source?.cold ??
      summarizeAppearances(appearances, (row) =>
        isColdTemp(row.weather?.temperature),
      ),
    indoor:
      source?.indoor ??
      summarizeAppearances(
        appearances,
        (row) => row.weather?.bucket === 'indoor',
      ),
    oneZone:
      source?.oneZone ??
      summarizeAppearances(
        appearances,
        (row) => travelSplitKey(row.travel) === 'oneZone',
      ),
    twoZones:
      source?.twoZones ??
      summarizeAppearances(
        appearances,
        (row) => travelSplitKey(row.travel) === 'twoZones',
      ),
    threePlus:
      source?.threePlus ??
      summarizeAppearances(
        appearances,
        (row) => travelSplitKey(row.travel) === 'threePlus',
      ),
    shortRest:
      source?.shortRest ??
      summarizeAppearances(
        appearances,
        (row) => restSplitKey(row.rest) === 'short',
      ),
    normalRest:
      source?.normalRest ??
      summarizeAppearances(
        appearances,
        (row) => restSplitKey(row.rest) === 'normal',
      ),
    longRest:
      source?.longRest ??
      summarizeAppearances(
        appearances,
        (row) => restSplitKey(row.rest) === 'long',
      ),
    byeRest:
      source?.byeRest ??
      summarizeAppearances(appearances, (row) => restSplitKey(row.rest) === 'bye'),
  }
}

function compactSplits(splits: ResolvedSplits) {
  const out: Record<string, string> = {}
  for (const [key, split] of Object.entries(splits)) {
    const line = splitLine(split)
    if (line) out[key] = line
  }
  return out
}

function splitLine(split: TeamSplit | null | undefined) {
  if (!split || split.games === 0) return null
  return `${split.detail} (${split.rate}) in ${split.games}`
}

function restSplitFor(splits: ResolvedSplits, kind: RestSplitKey) {
  if (kind === 'short') return splits.shortRest
  if (kind === 'normal') return splits.normalRest
  if (kind === 'long') return splits.longRest
  return splits.byeRest
}

function travelSplitFor(splits: ResolvedSplits, kind: TravelSplitKey) {
  if (kind === 'oneZone') return splits.oneZone
  if (kind === 'twoZones') return splits.twoZones
  return splits.threePlus
}

function weatherSituation(
  splits: ResolvedSplits,
  weather: FrozenWeather | null,
) {
  if (!weather) return []
  const rows: Array<{ kind: string; ats: string }> = []
  const add = (kind: string, split: TeamSplit) => {
    const line = splitLine(split)
    if (line) rows.push({ kind, ats: line })
  }
  if (weather.bucket === 'indoor') add('indoor', splits.indoor)
  else if (weather.bucket === 'benign') add('benign', splits.benign)
  else add('adverse', splits.adverse)
  if (weather.wet) add('wet', splits.wet)
  if (weather.windy) add('windy', splits.windy)
  if (isHotTemp(weather.temperature)) add('hot', splits.hot)
  if (isColdTemp(weather.temperature)) add('cold', splits.cold)
  return rows
}

function vsOpponentCovers(
  appearances: TeamAppearance[],
  opponent: { name: string; abbrev: string },
) {
  const abbrev = opponent.abbrev.trim().toLowerCase()
  const name = opponent.name.trim().toLowerCase()
  return recentCovers(
    appearances.filter((row) => {
      const rowAbbrev = row.opponentAbbrev.trim().toLowerCase()
      const rowName = row.opponent.trim().toLowerCase()
      return rowAbbrev === abbrev || rowName === name
    }),
  )
}

function roleLabel(spread: number, side: 'home' | 'away') {
  const site = side === 'home' ? 'home' : 'road'
  if (spread === 0) return `${site} pick'em`
  return spread > 0 ? `${site} dog` : `${site} favorite`
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
