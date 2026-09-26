import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import consensusData from './data/consensus.json'
import slateData from './data/current-slate.json'
import playerHistoryData from './data/player-history.json'
import recommendationHistoryData from './data/recommendation-history.json'
import predictionForecastsData from './data/prediction-forecasts.json'
import lineHistoryData from './data/line-history.json'
import badBeatsData from './data/bad-beats.json'
import lastKickoffData from './data/last-kickoff.json'
import weatherHistoryData from './data/weather-history.json'
import nflStarterInjuriesData from './data/nfl-starter-injuries.json'
import injuryLineHistoryData from './data/injury-line-history.json'
import cardOverridesData from './data/card-overrides.json'
import teamRosterData from './data/team-roster.json'
import seasonHistoryData from './data/season-history.json'
import PlayersView from './PlayersView'
import TeamsView from './TeamsView'
import LeagueHistoryView from './LeagueHistoryView'
import PerformanceView from './PerformanceView'
import BadBeatsView from './BadBeatsView'
import SuggestedCardPanel from './SuggestedCardPanel'
import HeadsUpFlipsModal from './HeadsUpFlipsModal'
import TeamLogo from './TeamLogo'
import GameWeather from './GameWeather'
import InjuryLink from './InjuryLink'
import NflStarterAvailability from './NflStarterAvailability'
import { publicBucketForPool, favorableHook, unfavorableHook, keyNumberHook, compareRecommendationOrder, recommendationOrderKey, classifyEdge } from './cardScoring'
import { generateSuggestedCard, type SuggestedCard } from './cardStrategy'
import { generateSeasonResultsCard } from './cardResults'
import {
  actualPoolView,
  generatePoolAwareCard,
  poolExpectationView,
  poolSupportProjectionsForWeek,
  poolSupportView,
  type PoolExpectationView,
  type PoolSupportView,
} from './cardPoolAware'
import { PoolSupportNote } from './PoolSupportNote'
import { sentGamesForWeek } from './cardOverrides'
import {
  dismissHeadsUpFlips,
  headsUpFlipsWereDismissed,
  sentRecFlipSignature,
  sentRecommendationFlips,
} from './sentRecFlips'
import { dispatchReviewRefresh } from './dispatchRefresh'
import { dispatchBadBeatChange } from './dispatchBadBeat'
import { compareLineHistoryListItems, formatLinePath, lineHistoryByEvent, spreadPathMove, ticksEndingAtLive, totalsEndingAtLive } from './lineHistory'
import {
  badBeatKey,
  beatsForSeason,
  mergeBadBeats,
  rememberBadBeatChange,
  unpublishedBadBeatChanges,
  type BadBeat,
  type BadBeatsFile,
} from './badBeats'
import { careerPlayerHistory } from './playerArchives'
import { locationFromPath, pathForTeam, pathForView, TEAM_PROFILE_HASH, type AppView } from './routes'
import {
  etDayKey,
  formatGameScore,
  gameIsOnEtDay,
  gameIsUpcoming,
  gameKickoffPhase,
  slateKickoffDays,
  statusIsFinal,
} from './gameStatus'
import { ourPickForGame, ourRosterEntry } from './ourEntry'
import { atsOutcomeLabel, atsOutcomeMark } from './pickLabels'
import { AtsChip } from './AtsChip'
import {
  formatPoolRecordDetail,
  formatPoolRecordLabel,
  poolRecordIsGraded,
  poolRecordsForWeek,
  poolSideSplitsForWeek,
} from './poolRecord'
import { formatRankedTeamName, teamKey, teamPageSlugs, buildTeamDirectory } from './teamPerformance'
import {
  formatGameRestLine,
  formatGameTravelLine,
  gameTravelZones,
  travelRestTitle,
  buildTravelRestIndex,
} from './travelRest'
import type { LastKickoffFile } from './lastKickoff'
import type { WeatherHistoryFile } from './weatherBuckets'
import type { TeamRosterFile } from './teamRoster'
import type { SeasonHistoryFile } from './seasonHistory'
import type { PredictionForecasts } from './playerPrediction'
import type { NflStarterInjuryFile } from './nflStarterInjuries'
import {
  filterInjuryLineEventsToListedStarters,
  formatInjuryLineEvent,
  injuryLineEventsForGame,
  injuryLineMoveAgrees,
  type InjuryLineHistory,
} from './injuryLineMoves'
import type {
  BookKey,
  CardOverrides,
  ConsensusFeed,
  ConsensusGame,
  ConsensusReport,
  EdgeCategory,
  GameAnalysis,
  GameVenue,
  LineHistory,
  LineTick,
  OddsEvent,
  OddsFeed,
  PlayerHistory,
  PlayerPick,
  RecommendationHistory,
  Slate,
  SlateGame,
  TotalTick,
} from './types'

const slate = slateData as unknown as Slate
const playerHistory = playerHistoryData as PlayerHistory
const careerHistory = careerPlayerHistory(playerHistory)
const recommendationHistory = recommendationHistoryData as RecommendationHistory
const predictionForecasts = predictionForecastsData as PredictionForecasts
const nflStarterInjuries =
  nflStarterInjuriesData as NflStarterInjuryFile
const nflInjuriesByAbbrev = new Map(
  nflStarterInjuries.teams.map((team) => [team.abbrev, team]),
)
const injuryLineHistory = injuryLineHistoryData as InjuryLineHistory
const consensusFeed = consensusData as ConsensusFeed
const lineHistory = lineHistoryData as LineHistory
const cardOverrides = cardOverridesData as CardOverrides
const badBeatsFile = badBeatsData as BadBeatsFile
const teamRoster = teamRosterData as TeamRosterFile
const seasonHistory = seasonHistoryData as SeasonHistoryFile
const teamSlugsByKey = teamPageSlugs(slate, recommendationHistory, teamRoster)
const travelRestIndex = buildTravelRestIndex(
  slate,
  recommendationHistory,
  lastKickoffData as LastKickoffFile,
)
const travelRestByEvent = travelRestIndex.byEvent
const fieldEntryId = ourRosterEntry(playerHistory)?.entryId ?? null
const poolRecordsByEvent = poolRecordsForWeek(
  playerHistory,
  slate.week.order,
  slate.pool.seasonYear,
  fieldEntryId,
)
const poolSideSplitsByEvent = poolSideSplitsForWeek(
  playerHistory,
  slate.week.order,
  slate.pool.seasonYear,
  fieldEntryId,
)
const poolFieldProjectionsByEvent = poolSupportProjectionsForWeek(
  careerHistory,
  recommendationHistory,
  predictionForecasts,
  slate.week.order,
  travelRestIndex.byAppearance,
)

function slateTeamName(sport: 'NFL' | 'NCAAF', abbrev: string) {
  for (const game of slate.games) {
    if (game.sport !== sport) continue
    if (game.away.abbrev === abbrev) return game.away.name
    if (game.home.abbrev === abbrev) return game.home.name
  }
  return abbrev
}
const lineHistoryByCbs = lineHistoryByEvent(
  lineHistory,
  slate.week.order,
  slate.pool.seasonYear,
)
// A dump from an earlier week would silently mislabel this week's rows.
const consensusByEvent = new Map(
  consensusFeed.week.order === slate.week.order
    ? consensusFeed.games.map((game) => [game.cbsEventId, game])
    : [],
)
const bookNames: Record<BookKey, string> = {
  draftkings: 'DraftKings',
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatSpread(value: number | null | undefined) {
  if (value == null) return '—'
  if (value === 0) return 'PK'
  const points = formatPoints(Math.abs(value))
  return value > 0 ? `+${points}` : `-${points}`
}

function formatSpreadPath(ticks: LineTick[], compact = false) {
  return formatLinePath(
    ticks.map((tick) => tick.home),
    formatSpread,
    compact,
  )
}

function formatTotalPath(ticks: TotalTick[], compact = false) {
  return formatLinePath(
    ticks.map((tick) => tick.line),
    formatPoints,
    compact,
  )
}

function pathTitle(ticks: Array<{ at: string; home?: number; line?: number }>) {
  return ticks
    .map((tick) => {
      const value =
        typeof tick.home === 'number' ? formatSpread(tick.home) : formatPoints(tick.line ?? 0)
      return `${value} at ${formatTimestamp(tick.at)}`
    })
    .join('\n')
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000

function formatAge(value: string, now: number) {
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatUpdatedAt(value: string | null) {
  if (!value) return 'Waiting for first odds refresh'
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))}`
}

function formatVenue(venue: GameVenue | null | undefined) {
  if (!venue) return null
  const place = [venue.city, venue.state].filter(Boolean).join(', ')
  const parts = [venue.stadium, place].filter(Boolean)
  if (!parts.length) return null
  return parts.join(' · ')
}

function analyzeGame(game: SlateGame, odds: OddsEvent | undefined): GameAnalysis {
  const consensus = consensusByEvent.get(game.cbsEventId)
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

function Recommendation({
  analysis,
  poolSupport,
}: {
  analysis: GameAnalysis
  poolSupport: PoolSupportView | null
}) {
  const { game, category, recommendedSide, edge } = analysis
  const band =
    edge && category !== 'pending' && category !== 'neutral'
      ? `${formatPoints(edge)} pt ${category}`
      : category
  if (category === 'pending') {
    return (
      <div className="recommendation-block">
        <div className="edge-label">Line Value</div>
        <div className="recommendation pending">
          <span className="category-dot" />
          Awaiting odds
        </div>
      </div>
    )
  }

  if (!recommendedSide) {
    const sittingHook = keyNumberHook(game.homeSpread)
    return (
      <div className="recommendation-block">
        <div className="edge-label">Line Value</div>
        <div className="edge-copy none">No edge</div>
        <div className={`recommendation ${category}`}>
          <span className="category-dot" />
          {band}
        </div>
        {sittingHook && (
          <div className="hook-badge sitting">
            {sittingHook === 'fg' ? 'FG' : 'TD'} hook
          </div>
        )}
      </div>
    )
  }

  const team = game[recommendedSide]
  const poolNumber = game.homeSpread * (recommendedSide === 'away' ? -1 : 1)
  const hook =
    analysis.liveHomeSpread == null
      ? null
      : favorableHook(game.homeSpread, analysis.liveHomeSpread)
  const badHook = hook ? null : unfavorableHook(poolNumber)

  return (
    <div className="recommendation-block">
      <div className="edge-label">Line Value</div>
      <div className="edge-copy">
        {team.name} {formatSpread(poolNumber)}
      </div>
      <div className={`recommendation ${category}`}>
        <span className="category-dot" />
        {band}
      </div>
      {hook && (
        <div className="hook-badge">
          favorable {hook === 'fg' ? 'FG' : 'TD'} hook
        </div>
      )}
      {badHook && (
        <div className="hook-badge unfavorable">
          unfavorable {badHook === 'fg' ? 'FG' : 'TD'} hook
        </div>
      )}
      <PoolSupportNote view={poolSupport} />
    </div>
  )
}

// The notes column is narrow, so multi-part notes are split into segments that
// each stay intact; the line breaks between them rather than inside a spread or
// ticket count.
function NoteParts({ parts }: { parts: string[] }) {
  if (parts.length === 1) return <>{parts[0]}</>
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 ? ' ' : null}
          <span className="note-part">{part}</span>
        </Fragment>
      ))}
    </>
  )
}

// Covers' headline blends tickets from multiple spread buckets. Keep it
// separate from the bucket nearest the locked pool line.
function ConsensusNote({
  consensus,
  now,
}: {
  consensus: ConsensusGame | undefined
  now: number
}) {
  if (!consensus || consensus.matchStatus !== 'matched') {
    return <span className="consensus-note empty">No public consensus yet</span>
  }

  const { away, home } = consensus
  if (away.pct == null || home.pct == null) {
    return <span className="consensus-note empty">No public consensus yet</span>
  }

  const captured = formatAge(consensusFeed.source.fetchedAt, now)
  const currentSides = [away, home]
    .map((side) => `${side.name} ${formatSpread(side.spread)}`)
    .join(' · ')
  const bucket = publicBucketForPool(consensus)
  let bucketParts = ['Per-line breakdown unavailable']
  if (bucket) {
    const bucketPicks = bucket.awayPicks + bucket.homePicks
    const bucketSide =
      bucket.awayPicks >= bucket.homePicks ? ('away' as const) : ('home' as const)
    const bucketLeader = consensus[bucketSide]
    const leaderPicks =
      bucketSide === 'away' ? bucket.awayPicks : bucket.homePicks
    const otherPicks =
      bucketSide === 'away' ? bucket.homePicks : bucket.awayPicks
    const bucketSpread =
      bucketSide === 'away' ? bucket.awaySpread : -bucket.awaySpread
    bucketParts = [
      `${bucketLeader.name} ${Math.round((leaderPicks / bucketPicks) * 100)}%`,
      `at ${formatSpread(bucketSpread)} (${leaderPicks}–${otherPicks})`,
    ]
  } else if (consensus.atsByLine) {
    bucketParts = ['No meaningful ticket bucket near the pool line']
  }
  const bucketSummary = bucketParts.join(' ')
  const title = `${consensusFeed.source.site} contest consensus, captured ${captured}. Headline percentages combine all lines. Current Sides: ${currentSides}. ${bucketSummary}.`

  return (
    <span className="consensus-note">
      {consensus.coversDetailsUrl ? (
        <a
          href={consensus.coversDetailsUrl}
          target="_blank"
          rel="noreferrer"
          title={title}
        >
          <NoteParts parts={bucketParts} />
        </a>
      ) : (
        <strong title={title}>
          <NoteParts parts={bucketParts} />
        </strong>
      )}
    </span>
  )
}

function ourPickLabel(game: SlateGame, pick: PlayerPick | null) {
  if (!pick?.pickedSide) return 'No pick recorded'
  const team = game[pick.pickedSide].name
  const number =
    pick.pickedSide === 'home' ? game.homeSpread : game.homeSpread * -1
  return `${team} ${formatSpread(number)}`
}

function OurPickNote({
  game,
  pick,
}: {
  game: SlateGame
  pick: PlayerPick | null
}) {
  const mark = atsOutcomeMark(pick?.result)
  const label = atsOutcomeLabel(pick?.result)
  return (
    <div className="our-pick">
      <span>Our pick</span>
      <strong>{ourPickLabel(game, pick)}</strong>
      <AtsChip
        mark={mark}
        label={label}
        state={pick?.result ?? 'pending'}
      />
    </div>
  )
}

function PoolShare({
  label,
  view,
}: {
  label: string
  view: PoolExpectationView | null
}) {
  if (!view) return null
  return (
    <div className="pool-expectation" title={view.title}>
      <div className="edge-label">{label}</div>
      <div className={`edge-copy${view.none ? ' none' : ''}`}>{view.line}</div>
      <small>{view.detail}</small>
    </div>
  )
}

function PoolSharePair({
  expected,
  actual,
}: {
  expected: PoolExpectationView | null
  actual: PoolExpectationView | null
}) {
  if (!expected && !actual) return null
  return (
    <div className="pool-share-stack">
      <PoolShare label="Expected pool" view={expected} />
      <PoolShare label="Actual pool" view={actual} />
    </div>
  )
}

function TeamMatchupSide({
  team,
  sport,
  slug,
  onOpenTeam,
}: {
  team: SlateGame['away']
  sport: SlateGame['sport']
  slug: string | undefined
  onOpenTeam: (slug: string) => void
}) {
  const inner = (
    <>
      <TeamLogo team={team} />
      <span className="team-name">
        {formatRankedTeamName(team.name, team.rank, sport)}
      </span>
    </>
  )
  if (!slug) return <div className="team">{inner}</div>
  return (
    <a
      className="team team-page-link"
      href={pathForTeam(slug)}
      title={`${team.name} team page`}
      onClick={(event) => {
        event.preventDefault()
        onOpenTeam(slug)
      }}
    >
      {inner}
    </a>
  )
}

function GameCard({
  analysis,
  now,
  ourPick,
  onOpenTeam,
}: {
  analysis: GameAnalysis
  now: number
  ourPick: PlayerPick | null
  onOpenTeam: (slug: string) => void
}) {
  const { game, odds, category } = analysis
  const venue = formatVenue(game.venue)
  const travelRest = travelRestByEvent.get(game.cbsEventId)
  const travelLine = travelRest
    ? formatGameTravelLine(travelRest, {
        away: game.away.name,
        home: game.home.name,
      })
    : null
  const restLine = travelRest
    ? formatGameRestLine(travelRest, {
        away: game.away.name,
        home: game.home.name,
      })
    : null
  const isTiebreaker = game.id === slate.tiebreaker?.gameId
  const history = lineHistoryByCbs.get(game.cbsEventId)
  const score = formatGameScore(game)
  const phase = gameKickoffPhase(game, now)
  const final = statusIsFinal(game.status)
  const poolRecord = poolRecordsByEvent.get(game.cbsEventId)
  const expectedPool = poolExpectationView(
    poolFieldProjectionsByEvent.get(game.cbsEventId),
    game.home.name,
    game.away.name,
  )
  const poolSupport = poolSupportView(
    poolFieldProjectionsByEvent.get(game.cbsEventId),
    analysis.recommendedSide,
    game.home.abbrev,
    game.away.abbrev,
  )
  const actualPool = actualPoolView(
    poolSideSplitsByEvent.get(game.cbsEventId),
    poolRecord,
    game.home.name,
    game.away.name,
    expectedPool,
  )
  const poolLine =
    poolRecordIsGraded(poolRecord) && !actualPool
      ? formatPoolRecordLabel(poolRecord)
      : null
  const poolDetail =
    poolRecordIsGraded(poolRecord) && !actualPool
      ? formatPoolRecordDetail(poolRecord)
      : null
  return (
    <article className={`game-card ${category}`}>
      <div className="game-meta">
        <span className={`sport-tag ${game.sport.toLowerCase()}`}>{game.sport}</span>
        <time dateTime={game.kickoff}>{game.kickoffLabel.replace(' ET', '')}</time>
        {score && (
          <span className={final ? 'game-final' : 'game-live'}>
            {final ? `Final ${score}` : `Live ${score}`}
          </span>
        )}
        {poolLine && (
          <span className="game-pool-record" title={poolDetail ?? undefined}>
            {poolLine}
          </span>
        )}
        {game.tv && <span>{game.tv}</span>}
        {venue && (
          <span
            className="game-venue"
            title={game.venue?.indoor ? `${venue} (indoor)` : venue}
          >
            {venue}
          </span>
        )}
        <GameWeather game={game} />
        {travelLine && (
          <span className="game-travel-rest" title={travelRestTitle()}>
            {travelLine}
          </span>
        )}
        {restLine && (
          <span className="game-travel-rest" title={travelRestTitle()}>
            {restLine}
          </span>
        )}
        {game.sport === 'NCAAF' && (
          <span className="game-injuries">
            <span>Injuries</span>
            <InjuryLink team={{ sport: game.sport, ...game.away }}>
              {game.away.name}
            </InjuryLink>
            <span aria-hidden="true">·</span>
            <InjuryLink team={{ sport: game.sport, ...game.home }}>
              {game.home.name}
            </InjuryLink>
          </span>
        )}
      </div>

      <div className="matchup">
        <TeamMatchupSide
          team={game.away}
          sport={game.sport}
          slug={teamSlugsByKey.get(teamKey(game.sport, game.away.abbrev))}
          onOpenTeam={onOpenTeam}
        />
        <span className={score ? 'game-score' : 'at'}>{score ?? '@'}</span>
        <TeamMatchupSide
          team={game.home}
          sport={game.sport}
          slug={teamSlugsByKey.get(teamKey(game.sport, game.home.abbrev))}
          onOpenTeam={onOpenTeam}
        />
      </div>

      <div className="line-grid">
        <div className="line-cell">
          <span>CBS locked</span>
          <strong>{formatSpread(game.homeSpread)}</strong>
          <em>pool line</em>
        </div>
        {(Object.keys(bookNames) as BookKey[]).map((book) => {
          const entry = odds?.lines[book]
          const total = isTiebreaker ? odds?.totals?.[book] : undefined
          const ticks = ticksEndingAtLive(history?.ticks ?? [], entry)
          const totals = totalsEndingAtLive(history?.totals, total)
          const spreadPath = formatSpreadPath(ticks, true)
          const totalPath = formatTotalPath(totals, true)
          const stale =
            !!entry && now - new Date(entry.retrievedAt).getTime() > STALE_AFTER_MS
          return (
            <div className={`line-cell${stale ? ' stale' : ''}`} key={book}>
              <span>{bookNames[book]}</span>
              <strong>{formatSpread(entry?.line)}</strong>
              {spreadPath ? (
                <span className="line-path" title={pathTitle(ticks)}>
                  {spreadPath}
                </span>
              ) : (
                entry?.previousLine != null && (
                  <span className="line-move">
                    was {formatSpread(entry.previousLine)}
                  </span>
                )
              )}
              {total && (
                <span
                  className="line-total"
                  title={totals.length > 0 ? pathTitle(totals) : undefined}
                >
                  {totalPath
                    ? `O/U ${totalPath}`
                    : `O/U ${formatPoints(total.line)}${
                        total.previousLine != null
                          ? ` · was ${formatPoints(total.previousLine)}`
                          : ''
                      }`}
                </span>
              )}
              {entry ? (
                <em title={`Retrieved ${formatTimestamp(entry.retrievedAt)}`}>
                  {formatAge(entry.retrievedAt, now)}
                </em>
              ) : (
                <em>no line yet</em>
              )}
            </div>
          )
        })}
      </div>

      <div className="card-footer">
        <Recommendation analysis={analysis} poolSupport={poolSupport} />
        <PoolSharePair expected={expectedPool} actual={actualPool} />
        {phase !== 'upcoming' && <OurPickNote game={game} pick={ourPick} />}
        <div className="card-notes">
          <span className="spread-note">All lines shown for {game.home.name}</span>
          <ConsensusNote consensus={analysis.consensus} now={now} />
        </div>
      </div>
      {game.sport === 'NFL' && (
        <NflStarterAvailability
          away={game.away}
          home={game.home}
          file={nflStarterInjuries}
          lineEvents={injuryLineEventsForGame(
            injuryLineHistory,
            game.cbsEventId,
            slate.week.order,
            slate.pool.seasonYear,
          )}
        />
      )}
    </article>
  )
}

function reportMatchup(
  row: ConsensusReport['games'][number],
  games: ConsensusGame[],
) {
  const game =
    games.find((item) =>
      row.cbsEventId != null ? item.cbsEventId === row.cbsEventId : false,
    ) ?? games.find((item) => row.gameId != null && item.gameId === row.gameId)
  if (game) return `${game.away.abbrev} @ ${game.home.abbrev}`
  return row.gameId ?? `Event ${row.cbsEventId}`
}

function CoversCollected({
  captured,
  fetchedAt,
  report,
  games,
}: {
  captured: string
  fetchedAt: string
  report: ConsensusReport | null | undefined
  games: ConsensusGame[]
}) {
  const stamp = formatTimestamp(fetchedAt)
  if (!report) {
    return (
      <p className="list-meta" title={stamp}>
        Covers.com data collected {captured}
      </p>
    )
  }

  return (
    <details className="covers-report">
      <summary className="list-meta" title={stamp}>
        Covers.com data collected {captured}
        <span className="covers-report-link">Consensus report</span>
      </summary>
      <div className="covers-report-body">
        <p>{report.summary}</p>
        {report.comparedTo && (
          <p className="covers-report-compared">
            Compared with the dump from {formatTimestamp(report.comparedTo)}
          </p>
        )}
        {report.details && <p className="covers-report-details">{report.details}</p>}
        {report.games.length > 0 && (
          <ul>
            {report.games.map((row, index) => (
              <li key={row.cbsEventId ?? row.gameId ?? index}>
                <strong>{reportMatchup(row, games)}</strong>
                {row.sides ? ` · ${row.sides}` : ''}
                {row.pct ? ` · ${row.pct}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

function LineHistoryNote({
  history,
  events,
}: {
  history: LineHistory
  events: OddsEvent[] | undefined
}) {
  const [sort, setSort] = useState<'kickoff' | 'movement'>('kickoff')
  const liveByEvent = new Map(
    (events ?? []).map((event) => [event.cbsEventId, event]),
  )
  const movers =
    history.week === slate.week.order
      ? history.games
          .map((game) => {
            const live = liveByEvent.get(game.cbsEventId)
            const ticks = ticksEndingAtLive(
              game.ticks,
              live?.lines.draftkings,
            )
            const totals = totalsEndingAtLive(
              game.totals,
              live?.totals?.draftkings,
            )
            const slateGame = slate.games.find(
              (item) => item.cbsEventId === game.cbsEventId,
            )
            return {
              game,
              slateGame,
              ticks,
              totals,
              kickoff: slateGame?.kickoff ?? '',
              move: spreadPathMove(ticks),
            }
          })
          .filter(
            ({ ticks, totals }) => ticks.length > 1 || totals.length > 1,
          )
          .sort((a, b) =>
            compareLineHistoryListItems(
              {
                kickoff: a.kickoff,
                cbsEventId: a.game.cbsEventId,
                move: a.move,
              },
              {
                kickoff: b.kickoff,
                cbsEventId: b.game.cbsEventId,
                move: b.move,
              },
              sort,
            ),
          )
      : []

  if (movers.length === 0) return null

  return (
    <details className="covers-report">
      <summary className="list-meta">
        {`${movers.length} DraftKings spread${
          movers.length === 1 ? ' has' : 's have'
        } moved this week`}
        <span className="covers-report-link">Line history</span>
      </summary>
      <div className="covers-report-body">
        <div className="line-history-toolbar">
          <p>
            Every DraftKings number since the game first appeared on this
            slate. Unchanged pulls are skipped. Paths freeze at kickoff.
          </p>
          <label>
            <span className="sr-only">Sort line history</span>
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as 'kickoff' | 'movement')
              }
            >
              <option value="kickoff">Kickoff time</option>
              <option value="movement">Biggest move</option>
            </select>
          </label>
        </div>
        <ul>
          {movers.map(({ game, slateGame, ticks, totals }) => (
            <li key={game.cbsEventId}>
              <strong>
                {slateGame
                  ? `${slateGame.away.abbrev} @ ${slateGame.home.abbrev}`
                  : `Event ${game.cbsEventId}`}
              </strong>
              {ticks.length > 1 ? ` · ${formatSpreadPath(ticks)}` : ''}
              {totals.length > 1 ? ` · O/U ${formatTotalPath(totals)}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function InjuryLineWeekNote({
  history,
}: {
  history: InjuryLineHistory
}) {
  const games =
    history.week === slate.week.order
      ? history.games
          .map((row) => {
            const slateGame = slate.games.find(
              (item) => item.cbsEventId === row.cbsEventId,
            )
            const coincidences = filterInjuryLineEventsToListedStarters(
              row.events,
              nflStarterInjuries,
              slateGame
                ? [slateGame.away.abbrev, slateGame.home.abbrev]
                : undefined,
            ).filter((event) => injuryLineMoveAgrees(event))
            return { row, slateGame, coincidences }
          })
          .filter(({ coincidences }) => coincidences.length > 0)
      : []
  if (games.length === 0) return null

  return (
    <details className="covers-report">
      <summary className="list-meta">
        {`${games.length} NFL game${games.length === 1 ? '' : 's'} had a starter-status change on a DraftKings move`}
        <span className="covers-report-link">Injury-timed lines</span>
      </summary>
      <div className="covers-report-body">
        <p>{history.note}</p>
        <ul>
          {games.map(({ row, slateGame, coincidences }) => (
            <li key={row.cbsEventId}>
              <strong>
                {slateGame
                  ? `${slateGame.away.abbrev} @ ${slateGame.home.abbrev}`
                  : `Event ${row.cbsEventId}`}
              </strong>
              {coincidences.map((event) => (
                <span key={`${event.athleteId ?? event.name}:${event.at}`}>
                  {` · ${formatInjuryLineEvent(event)}`}
                </span>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function App() {
  const [view, setView] = useState<AppView>(() => locationFromPath().view)
  const [teamSlug, setTeamSlug] = useState<string | null>(
    () => locationFromPath().teamSlug,
  )
  const [playerSlug, setPlayerSlug] = useState<string | null>(
    () => locationFromPath().playerSlug,
  )
  const [feed, setFeed] = useState<OddsFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<EdgeCategory | 'all'>('all')
  const [sort, setSort] = useState<'kickoff' | 'recommendation' | 'travel'>(
    'kickoff',
  )
  const [travelMin, setTravelMin] = useState<0 | 1 | 2 | 3>(0)
  const [league, setLeague] = useState<'all' | 'NCAAF' | 'NFL'>('all')
  const [query, setQuery] = useState('')
  const [kickoffFilter, setKickoffFilter] = useState<
    'all' | 'upcoming' | 'in-progress' | 'completed'
  >('upcoming')
  const [dayFilter, setDayFilter] = useState<'all' | 'today' | string>('all')
  const [now, setNow] = useState(() => Date.now())
  const [suggestedCard, setSuggestedCard] = useState<SuggestedCard | null>(null)
  const [dismissedFlipSignature, setDismissedFlipSignature] = useState<
    string | null
  >(null)
  const [dispatching, setDispatching] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [beats, setBeats] = useState(() => mergeBadBeats(badBeatsFile))
  const closeSuggestedCard = useCallback(() => setSuggestedCard(null), [])
  const seasonBeats = useMemo(
    () => beatsForSeason(beats, slate.pool.seasonYear),
    [beats],
  )

  const persistBadBeat = useCallback(
    async (change: Parameters<typeof dispatchBadBeatChange>[0]) => {
      try {
        await dispatchBadBeatChange(change)
      } catch (persistError) {
        setToast(
          persistError instanceof Error
            ? persistError.message
            : 'Saved on this device, but could not publish the bad beat.',
        )
      }
    },
    [],
  )

  const markBadBeat = useCallback((draft: Omit<BadBeat, 'markedAt'>) => {
    const beat: BadBeat = {
      ...draft,
      note: draft.note?.trim() || null,
      markedAt: new Date().toISOString(),
    }
    rememberBadBeatChange({ action: 'add', beat })
    setBeats(mergeBadBeats(badBeatsFile))
    void persistBadBeat({ action: 'add', beat })
  }, [persistBadBeat])

  const clearBadBeat = useCallback((beat: BadBeat) => {
    const change = {
      action: 'remove' as const,
      key: badBeatKey(beat.seasonYear, beat.cbsEventId),
    }
    rememberBadBeatChange(change)
    setBeats(mergeBadBeats(badBeatsFile))
    void persistBadBeat(change)
  }, [persistBadBeat])

  const updateBadBeatNote = useCallback((beat: BadBeat, note: string | null) => {
    const next = { ...beat, note: note?.trim() || null }
    rememberBadBeatChange({ action: 'add', beat: next })
    setBeats(mergeBadBeats(badBeatsFile))
    void persistBadBeat({ action: 'add', beat: next })
  }, [persistBadBeat])

  useEffect(() => {
    const pending = unpublishedBadBeatChanges(badBeatsFile)
    if (pending.adds.length === 0 && pending.removes.length === 0) return
    try {
      if (sessionStorage.getItem('pickem-bad-beats-flush')) return
      sessionStorage.setItem('pickem-bad-beats-flush', '1')
    } catch {
      // Private mode can block sessionStorage.
    }
    for (const beat of pending.adds) {
      void persistBadBeat({ action: 'add', beat })
    }
    for (const key of pending.removes) {
      void persistBadBeat({ action: 'remove', key })
    }
  }, [persistBadBeat])

  const refreshData = useCallback(async () => {
    const confirmed = window.confirm(
      'Reload DraftKings lines and Covers public consensus? This starts jobs that usually take a few minutes. New numbers will not show until you refresh the page.',
    )
    if (!confirmed) return

    setDispatching(true)
    try {
      await dispatchReviewRefresh()
      setToast(
        'Refresh is under way. DraftKings lines and the latest Covers dump usually appear in a few minutes. Reload the page then.',
      )
    } catch (refreshError) {
      setToast(
        refreshError instanceof Error
          ? refreshError.message
          : 'Could not start the refresh.',
      )
    } finally {
      setDispatching(false)
    }
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 12000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const goTo = useCallback((
    next: AppView,
    slug: string | null = null,
    hash?: string,
  ) => {
    const path = pathForView(next, slug)
    const url = hash ? `${path}#${hash.replace(/^#/, '')}` : path
    if (
      `${window.location.pathname}${window.location.search}${window.location.hash}` !==
      url
    ) {
      window.history.pushState(null, '', url)
    }
    setView(next)
    setTeamSlug(next === 'teams' ? slug : null)
    setPlayerSlug(next === 'players' ? slug : null)
    if (next !== 'lines') setSuggestedCard(null)
  }, [])

  const loadOdds = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/odds.json?t=${Date.now()}`,
        { cache: 'no-store' },
      )
      if (!response.ok) throw new Error(`Odds feed returned ${response.status}`)
      setFeed((await response.json()) as OddsFeed)
      setNow(Date.now())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load odds')
    }
  }, [])

  useEffect(() => {
    // Initial external data synchronization; later refreshes are user initiated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOdds()
  }, [loadOdds])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    function onPopState() {
      const location = locationFromPath()
      setView(location.view)
      setTeamSlug(location.teamSlug)
      setPlayerSlug(location.playerSlug)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const analyses = useMemo(
    () =>
      slate.games.map((game) =>
        analyzeGame(
          game,
          feed?.events.find((event) => event.cbsEventId === game.cbsEventId),
        ),
      ),
    [feed],
  )
  const liveCard = useMemo(
    () =>
      generateSuggestedCard(
        analyses.filter(({ game }) => gameIsUpcoming(game, now)),
        slate.week,
        slate.pool.seasonYear,
        slate.tiebreaker,
        new Date(now),
        travelRestByEvent,
        nflInjuriesByAbbrev,
      ),
    [analyses, now],
  )
  const sentRecFlips = useMemo(() => {
    // Odds start null; a line-less first card can invent rest/travel flips
    // that vanish as soon as DraftKings loads. Wait for the feed.
    if (!feed) return []
    return sentRecommendationFlips(
      slate.games,
      sentGamesForWeek(cardOverrides, slate.week.order),
      liveCard.picks,
      now,
    )
  }, [feed, liveCard, now])
  const flipSignature = useMemo(
    () => sentRecFlipSignature(sentRecFlips),
    [sentRecFlips],
  )
  const headsUpOpen =
    view === 'lines' &&
    feed != null &&
    sentRecFlips.length > 0 &&
    dismissedFlipSignature !== flipSignature &&
    !headsUpFlipsWereDismissed(
      slate.pool.seasonYear,
      slate.week.order,
      sentRecFlips,
    )

  const kickoffDays = useMemo(
    () => slateKickoffDays(slate.games, now),
    [now],
  )
  const todayKickoff = kickoffDays.find((day) => day.isToday)

  const scopedAnalyses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return analyses.filter(({ game }) => {
      const matchesLeague = league === 'all' || game.sport === league
      const matchesQuery =
        !normalizedQuery ||
        [game.away.name, game.away.abbrev, game.home.name, game.home.abbrev].some(
          (value) => value.toLowerCase().includes(normalizedQuery),
        )
      const matchesKickoff =
        kickoffFilter === 'all' || gameKickoffPhase(game, now) === kickoffFilter
      const todayKey = etDayKey(now)
      const matchesDay =
        dayFilter === 'all' ||
        (dayFilter === 'today'
          ? todayKey != null && gameIsOnEtDay(game, todayKey)
          : gameIsOnEtDay(game, dayFilter))
      return matchesLeague && matchesQuery && matchesKickoff && matchesDay
    })
  }, [analyses, dayFilter, kickoffFilter, league, now, query])

  const counts = useMemo(
    () =>
      scopedAnalyses.reduce(
        (totals, analysis) => {
          totals[analysis.category] += 1
          return totals
        },
        { lock: 0, hammer: 0, lean: 0, slight: 0, neutral: 0, pending: 0 },
      ),
    [scopedAnalyses],
  )

  const visibleGames = useMemo(() => {
    const filtered = scopedAnalyses.filter(({ category, game }) => {
      if (filter !== 'all' && category !== filter) return false
      if (travelMin > 0) {
        const zones = gameTravelZones(travelRestByEvent.get(game.cbsEventId))
        if (zones < travelMin) return false
      }
      return true
    })

    if (sort === 'recommendation') {
      return [...filtered].sort((a, b) =>
        compareRecommendationOrder(
          recommendationOrderKey({
            category: a.category,
            edge: a.edge,
            recommendedSide: a.recommendedSide,
            homeSpread: a.game.homeSpread,
            liveHomeSpread: a.liveHomeSpread,
            consensus: a.consensus,
            travelRest: travelRestByEvent.get(a.game.cbsEventId),
            kickoff: a.game.kickoff,
          }),
          recommendationOrderKey({
            category: b.category,
            edge: b.edge,
            recommendedSide: b.recommendedSide,
            homeSpread: b.game.homeSpread,
            liveHomeSpread: b.liveHomeSpread,
            consensus: b.consensus,
            travelRest: travelRestByEvent.get(b.game.cbsEventId),
            kickoff: b.game.kickoff,
          }),
        ),
      )
    }

    if (sort === 'travel') {
      return [...filtered].sort((a, b) => {
        const zoneDiff =
          gameTravelZones(travelRestByEvent.get(b.game.cbsEventId)) -
          gameTravelZones(travelRestByEvent.get(a.game.cbsEventId))
        if (zoneDiff !== 0) return zoneDiff
        return a.game.kickoff.localeCompare(b.game.kickoff)
      })
    }

    return filtered
  }, [filter, scopedAnalyses, sort, travelMin])

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href={pathForView('lines')}
          aria-label="Pick'em Edge home"
          onClick={(event) => {
            event.preventDefault()
            goTo('lines')
          }}
        >
          <span>Pick&apos;em Edge</span>
        </a>
        <nav className="primary-nav" aria-label="Primary navigation">
          <a
            className={view === 'lines' ? 'active' : ''}
            href={pathForView('lines')}
            onClick={(event) => {
              event.preventDefault()
              goTo('lines')
            }}
          >
            Lines
          </a>
          <a
            className={view === 'players' ? 'active' : ''}
            href={pathForView('players')}
            onClick={(event) => {
              event.preventDefault()
              goTo('players')
            }}
          >
            Players
          </a>
          <a
            className={view === 'teams' ? 'active' : ''}
            href={pathForView('teams')}
            onClick={(event) => {
              event.preventDefault()
              goTo('teams')
            }}
          >
            Teams
          </a>
          <a
            className={view === 'history' ? 'active' : ''}
            href={pathForView('history')}
            onClick={(event) => {
              event.preventDefault()
              goTo('history')
            }}
          >
            History
          </a>
          <a
            className={view === 'performance' ? 'active' : ''}
            href={pathForView('performance')}
            onClick={(event) => {
              event.preventDefault()
              goTo('performance')
            }}
          >
            Performance
          </a>
          <a
            className={view === 'bad-beats' ? 'active' : ''}
            href={pathForView('bad-beats')}
            onClick={(event) => {
              event.preventDefault()
              goTo('bad-beats')
            }}
          >
            Bad beats
          </a>
        </nav>
      </header>

      {toast && (
        <div className="refresh-toast" role="status" aria-live="polite">
          <p>{toast}</p>
          <button type="button" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      )}

      {view === 'lines' ? (
        <main>
        <section className="hero players-hero">
          <div>
            <p className="eyebrow">
              {slate.pool.seasonYear} season ·{' '}
              {slate.pool.entriesCount ?? playerHistory.entries.length} entries
            </p>
            <h1>{slate.pool.name}</h1>
            <p className="hero-copy">
              Compare the pool&apos;s locked line with DraftKings.
              Recommendations use the current DraftKings spread.
            </p>
          </div>
          <div className="hero-aside">
            <div className="week-chip">
              <span>DraftKings</span>
              <strong>{feed?.updatedAt ? 'Live' : '—'}</strong>
              <small>{formatUpdatedAt(feed?.updatedAt ?? null)}</small>
            </div>
            <button
              className="refresh-button in-page"
              type="button"
              onClick={() => void refreshData()}
              disabled={dispatching}
            >
              <span aria-hidden="true">↻</span>
              {dispatching ? 'Starting…' : 'Refresh data'}
            </button>
          </div>
        </section>

        {error && (
          <div className="notice error" role="alert">
            Couldn&apos;t refresh the odds file: {error}
          </div>
        )}
        {!feed?.updatedAt && !error && (
          <div className="notice">
            The slate is loaded. Live sportsbook lines will appear after the first
            GitHub Actions refresh.
          </div>
        )}

        <section className="summary-section" aria-label="Recommendation summary">
          <div className="summary-heading">
            <p className="eyebrow">Current slate</p>
            <h2>{slate.week.label}</h2>
            <p className="summary-heading-meta">
              {slate.week.gamesOnSlate} games
            </p>
          </div>
          <div className="summary-grid">
            <button className="summary-card lock" onClick={() => setFilter('lock')}>
              <span>Locks</span>
              <strong>{counts.lock}</strong>
              <small>4+ point edge</small>
            </button>
            <button className="summary-card hammer" onClick={() => setFilter('hammer')}>
              <span>Hammers</span>
              <strong>{counts.hammer}</strong>
              <small>3–3.5 points</small>
            </button>
            <button className="summary-card lean" onClick={() => setFilter('lean')}>
              <span>Leans</span>
              <strong>{counts.lean}</strong>
              <small>1.5–2.5 points</small>
            </button>
            <button className="summary-card slight" onClick={() => setFilter('slight')}>
              <span>Slights</span>
              <strong>{counts.slight}</strong>
              <small>0.5–1 point</small>
            </button>
            <button className="summary-card neutral" onClick={() => setFilter('neutral')}>
              <span>Neutral</span>
              <strong>{counts.neutral}</strong>
              <small>Lines match</small>
            </button>
            <button className="summary-card pending" onClick={() => setFilter('pending')}>
              <span>Awaiting lines</span>
              <strong>{counts.pending}</strong>
              <small>Not yet matched</small>
            </button>
          </div>
        </section>

        <section className="slate-section">
          <div className="controls">
            <label className="search">
              <span className="sr-only">Search teams</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search teams"
              />
            </label>
            <label>
              <span className="sr-only">Filter by league</span>
              <select
                value={league}
                onChange={(event) =>
                  setLeague(event.target.value as 'all' | 'NCAAF' | 'NFL')
                }
              >
                <option value="all">All leagues</option>
                <option value="NCAAF">NCAAF</option>
                <option value="NFL">NFL</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter recommendations</span>
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as EdgeCategory | 'all')
                }
              >
                <option value="all">All games</option>
                <option value="lock">Locks</option>
                <option value="hammer">Hammers</option>
                <option value="lean">Leans</option>
                <option value="slight">Slights</option>
                <option value="neutral">Neutral</option>
                <option value="pending">Awaiting lines</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Sort games</span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(
                    event.target.value as
                      | 'kickoff'
                      | 'recommendation'
                      | 'travel',
                  )
                }
              >
                <option value="kickoff">Kickoff time</option>
                <option value="recommendation">Recommendation</option>
                <option value="travel">Travel (most zones)</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by kickoff day</span>
              <select
                value={dayFilter}
                onChange={(event) => setDayFilter(event.target.value)}
              >
                <option value="all">All days</option>
                <option value="today">
                  {todayKickoff ? `Today · ${todayKickoff.label}` : 'Today'}
                </option>
                {kickoffDays
                  .filter((day) => !day.isToday)
                  .map((day) => (
                    <option key={day.key} value={day.key}>
                      {day.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by travel</span>
              <select
                value={String(travelMin)}
                onChange={(event) =>
                  setTravelMin(
                    Number(event.target.value) as 0 | 1 | 2 | 3,
                  )
                }
              >
                <option value="0">Any travel</option>
                <option value="1">1+ time zones</option>
                <option value="2">2+ time zones</option>
                <option value="3">3+ time zones</option>
              </select>
            </label>
            <label className="upcoming-filter">
              <input
                type="checkbox"
                checked={kickoffFilter === 'upcoming'}
                onChange={(event) =>
                  setKickoffFilter(event.target.checked ? 'upcoming' : 'all')
                }
              />
              Upcoming only
            </label>
            <label className="upcoming-filter">
              <input
                type="checkbox"
                checked={kickoffFilter === 'in-progress'}
                onChange={(event) =>
                  setKickoffFilter(event.target.checked ? 'in-progress' : 'all')
                }
              />
              In progress
            </label>
            <label className="upcoming-filter">
              <input
                type="checkbox"
                checked={kickoffFilter === 'completed'}
                onChange={(event) =>
                  setKickoffFilter(event.target.checked ? 'completed' : 'all')
                }
              />
              Completed
            </label>
            <div className="generate-card-group">
              <button
                className="generate-card-button"
                type="button"
                onClick={() => {
                  const upcoming = analyses.filter(({ game }) =>
                    gameIsUpcoming(game, Date.now()),
                  )
                  setSuggestedCard(
                    generateSuggestedCard(
                      upcoming,
                      slate.week,
                      slate.pool.seasonYear,
                      slate.tiebreaker,
                      new Date(),
                      travelRestByEvent,
                      nflInjuriesByAbbrev,
                    ),
                  )
                }}
              >
                ATS card
              </button>
              <button
                className="generate-card-button secondary"
                type="button"
                onClick={() => {
                  const upcoming = analyses.filter(({ game }) =>
                    gameIsUpcoming(game, Date.now()),
                  )
                  const scoredWeeks = playerHistory.weeks.filter(
                    (week) =>
                      week.scored &&
                      (week.seasonYear ?? playerHistory.pool.seasonYear) ===
                        slate.pool.seasonYear,
                  ).length
                  setSuggestedCard(
                    generateSeasonResultsCard(
                      upcoming,
                      slate.week,
                      slate.pool.seasonYear,
                      slate.tiebreaker,
                      buildTeamDirectory(
                        slate,
                        recommendationHistory,
                        weatherHistoryData as WeatherHistoryFile,
                        lastKickoffData as LastKickoffFile,
                        teamRoster,
                      ),
                      scoredWeeks,
                      new Date(),
                      travelRestByEvent,
                    ),
                  )
                }}
              >
                Results card
              </button>
              <button
                className="generate-card-button secondary"
                type="button"
                onClick={() => {
                  const upcoming = analyses.filter(({ game }) =>
                    gameIsUpcoming(game, Date.now()),
                  )
                  setSuggestedCard(
                    generatePoolAwareCard(
                      upcoming,
                      slate.week,
                      slate.pool.seasonYear,
                      slate.tiebreaker,
                      poolFieldProjectionsByEvent,
                      new Date(),
                      travelRestByEvent,
                      nflInjuriesByAbbrev,
                    ),
                  )
                }}
              >
                Pool-aware card
              </button>
            </div>
          </div>

          {suggestedCard && (
            <SuggestedCardPanel
              card={suggestedCard}
              poolProjections={poolFieldProjectionsByEvent}
              savedSentGames={sentGamesForWeek(
                cardOverrides,
                slate.week.order,
              )}
              onClose={closeSuggestedCard}
            />
          )}
          {headsUpOpen && sentRecFlips.length > 0 && (
            <HeadsUpFlipsModal
              weekLabel={slate.week.label}
              flips={sentRecFlips}
              onDismiss={() => {
                dismissHeadsUpFlips(
                  slate.pool.seasonYear,
                  slate.week.order,
                  sentRecFlips,
                )
                setDismissedFlipSignature(flipSignature)
              }}
            />
          )}

          {consensusFeed.week.order === slate.week.order && (
            <CoversCollected
              captured={formatAge(consensusFeed.source.fetchedAt, now)}
              fetchedAt={consensusFeed.source.fetchedAt}
              report={consensusFeed.report}
              games={consensusFeed.games}
            />
          )}
          <LineHistoryNote
            history={lineHistory}
            events={feed?.events}
          />
          <InjuryLineWeekNote history={injuryLineHistory} />

          <div className="game-list">
            {visibleGames.map((analysis) => (
              <GameCard
                key={analysis.game.cbsEventId}
                analysis={analysis}
                now={now}
                ourPick={ourPickForGame(
                  playerHistory,
                  slate.week.order,
                  analysis.game.cbsEventId,
                )}
                onOpenTeam={(slug) => goTo('teams', slug, TEAM_PROFILE_HASH)}
              />
            ))}
          </div>

          {visibleGames.length === 0 && (
            <div className="empty-state">
              No games match this filter.{' '}
              <button
                type="button"
                onClick={() => {
                  setFilter('all')
                  setLeague('all')
                  setSort('kickoff')
                  setTravelMin(0)
                  setQuery('')
                  setKickoffFilter('all')
                  setDayFilter('all')
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </section>
        </main>
      ) : view === 'players' ? (
        <PlayersView
          slate={slate}
          history={playerHistory}
          careerHistory={careerHistory}
          recommendations={recommendationHistory}
          forecasts={predictionForecasts}
          teamRoster={teamRoster}
          selectedSlug={playerSlug}
          onSelectPlayer={(slug) => goTo('players', slug)}
        />
      ) : view === 'teams' ? (
        <TeamsView
          slate={slate}
          playerHistory={playerHistory}
          recommendations={recommendationHistory}
          selectedSlug={teamSlug}
          onSelectTeam={(slug) => goTo('teams', slug, TEAM_PROFILE_HASH)}
          seasonBeats={seasonBeats}
          onMarkBadBeat={markBadBeat}
          onClearBadBeat={clearBadBeat}
          onOpenBadBeats={(hash) => goTo('bad-beats', null, hash)}
        />
      ) : view === 'history' ? (
        <LeagueHistoryView
          archive={seasonHistory}
          current={playerHistory}
          onSelectPlayer={(slug) => goTo('players', slug)}
        />
      ) : view === 'bad-beats' ? (
        <BadBeatsView
          seasonYear={slate.pool.seasonYear}
          beats={beats}
          recommendations={recommendationHistory}
          onClear={clearBadBeat}
          onUpdateNote={updateBadBeatNote}
        />
      ) : (
        <PerformanceView
          history={recommendationHistory}
          playerHistory={playerHistory}
          forecasts={predictionForecasts}
          seasonYear={slate.pool.seasonYear}
          seasonBeats={seasonBeats}
          teamName={slateTeamName}
          onMarkBadBeat={markBadBeat}
          onClearBadBeat={clearBadBeat}
          onOpenBadBeats={() => goTo('bad-beats')}
        />
      )}

      <footer>
        {view === 'lines' ? (
          <>
            CBS line captured{' '}
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(slate.source.fetchedAt))}
            . Sportsbook data provided by SharpAPI.
          </>
        ) : view === 'players' ? (
          <>
            Player history captured{' '}
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(playerHistory.source.fetchedAt))}
            .
          </>
        ) : view === 'teams' ? (
          <>
            Team ATS uses CBS covers from the frozen recommendation snapshot
            updated{' '}
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(recommendationHistory.updatedAt))}
            .
          </>
        ) : view === 'history' ? (
          <>
            CBS historical standings captured{' '}
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(seasonHistory.source.fetchedAt))}
            .
          </>
        ) : view === 'bad-beats' ? (
          <>
            Bad beats are a display-only stamp. They do not change ATS,
            recommendations, or picker habits.
          </>
        ) : (
          <>
            Recommendations frozen{' '}
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(recommendationHistory.updatedAt))}
            .
          </>
        )}
      </footer>
    </div>
  )
}

export default App
