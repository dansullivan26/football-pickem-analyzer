import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import consensusData from './data/consensus.json'
import slateData from './data/current-slate.json'
import playerHistoryData from './data/player-history.json'
import recommendationHistoryData from './data/recommendation-history.json'
import predictionForecastsData from './data/prediction-forecasts.json'
import lineHistoryData from './data/line-history.json'
import badBeatsData from './data/bad-beats.json'
import PlayersView from './PlayersView'
import TeamsView from './TeamsView'
import PerformanceView from './PerformanceView'
import BadBeatsView from './BadBeatsView'
import SuggestedCardPanel from './SuggestedCardPanel'
import TeamLogo from './TeamLogo'
import GameWeather from './GameWeather'
import InjuryLink from './InjuryLink'
import { publicBucketForPool, favorableHook, unfavorableHook, keyNumberHook, compareRecommendationOrder, recommendationOrderKey, classifyEdge } from './cardScoring'
import { generateSuggestedCard, type SuggestedCard } from './cardStrategy'
import { dispatchReviewRefresh } from './dispatchRefresh'
import { dispatchBadBeatChange } from './dispatchBadBeat'
import { formatLinePath, lineHistoryByEvent, ticksEndingAtLive, totalsEndingAtLive } from './lineHistory'
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
  gameIsCompleted,
  gameIsOnEtDay,
  gameIsUpcoming,
  slateKickoffDays,
} from './gameStatus'
import { ourPickForGame } from './ourEntry'
import { formatRankedTeamName, teamKey, teamPageSlugs } from './teamPerformance'
import {
  formatGameRestLine,
  formatGameTravelLine,
  gameTravelZones,
  travelRestTitle,
  buildTravelRestIndex,
} from './travelRest'
import type { PredictionForecasts } from './playerPrediction'
import type {
  BookKey,
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

const slate = slateData as Slate
const playerHistory = playerHistoryData as PlayerHistory
const careerHistory = careerPlayerHistory(playerHistory)
const recommendationHistory = recommendationHistoryData as RecommendationHistory
const predictionForecasts = predictionForecastsData as PredictionForecasts
const consensusFeed = consensusData as ConsensusFeed
const lineHistory = lineHistoryData as LineHistory
const badBeatsFile = badBeatsData as BadBeatsFile
const teamSlugsByKey = teamPageSlugs(slate, recommendationHistory)
const travelRestByEvent = buildTravelRestIndex(
  slate,
  recommendationHistory,
).byEvent

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

function Recommendation({ analysis }: { analysis: GameAnalysis }) {
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
  const result = pick?.result
  return (
    <div className="our-pick">
      <span>Our pick</span>
      <strong>{ourPickLabel(game, pick)}</strong>
      {result && (
        <small className={`pick-result ${result}`}>
          {result === 'win' ? 'Win' : result === 'loss' ? 'Loss' : 'Push'}
        </small>
      )}
    </div>
  )
}

function TeamMatchupSide({
  team,
  slug,
  onOpenTeam,
}: {
  team: SlateGame['away']
  slug: string | undefined
  onOpenTeam: (slug: string) => void
}) {
  const inner = (
    <>
      <TeamLogo team={team} />
      <span className="team-name">
        {formatRankedTeamName(team.name, team.rank)}
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
  const restLine = travelRest ? formatGameRestLine(travelRest) : null
  const isTiebreaker = game.id === slate.tiebreaker?.gameId
  const history = lineHistoryByCbs.get(game.cbsEventId)
  const score = formatGameScore(game)
  const completed = gameIsCompleted(game, now)
  return (
    <article className={`game-card ${category}`}>
      <div className="game-meta">
        <span className={`sport-tag ${game.sport.toLowerCase()}`}>{game.sport}</span>
        <time dateTime={game.kickoff}>{game.kickoffLabel.replace(' ET', '')}</time>
        {score && <span className="game-final">Final {score}</span>}
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
      </div>

      <div className="matchup">
        <TeamMatchupSide
          team={game.away}
          slug={teamSlugsByKey.get(teamKey(game.sport, game.away.abbrev))}
          onOpenTeam={onOpenTeam}
        />
        <span className={score ? 'game-score' : 'at'}>{score ?? '@'}</span>
        <TeamMatchupSide
          team={game.home}
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
        <Recommendation analysis={analysis} />
        {completed && <OurPickNote game={game} pick={ourPick} />}
        <div className="card-notes">
          <span className="spread-note">All lines shown for {game.home.name}</span>
          <ConsensusNote consensus={analysis.consensus} now={now} />
        </div>
      </div>
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
            const first = ticks[0]
            const last = ticks[ticks.length - 1]
            const delta =
              first && last ? Math.abs(last.home - first.home) : 0
            return { game, slateGame, ticks, totals, delta }
          })
          .filter(
            ({ ticks, totals }) => ticks.length > 1 || totals.length > 1,
          )
          .sort((a, b) => {
            if (b.delta !== a.delta) return b.delta - a.delta
            return (a.slateGame?.kickoff ?? '').localeCompare(
              b.slateGame?.kickoff ?? '',
            )
          })
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
        <p>
          Every DraftKings number since the game first appeared on this
          slate. Unchanged pulls are skipped. Paths freeze at kickoff.
        </p>
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
  const [upcomingOnly, setUpcomingOnly] = useState(true)
  const [completedOnly, setCompletedOnly] = useState(false)
  const [dayFilter, setDayFilter] = useState<'all' | 'today' | string>('all')
  const [now, setNow] = useState(() => Date.now())
  const [suggestedCard, setSuggestedCard] = useState<SuggestedCard | null>(null)
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
      const matchesUpcoming = !upcomingOnly || gameIsUpcoming(game, now)
      const matchesCompleted = !completedOnly || gameIsCompleted(game, now)
      const todayKey = etDayKey(now)
      const matchesDay =
        dayFilter === 'all' ||
        (dayFilter === 'today'
          ? todayKey != null && gameIsOnEtDay(game, todayKey)
          : gameIsOnEtDay(game, dayFilter))
      return (
        matchesLeague &&
        matchesQuery &&
        matchesUpcoming &&
        matchesCompleted &&
        matchesDay
      )
    })
  }, [analyses, completedOnly, dayFilter, league, now, query, upcomingOnly])

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
            kickoff: a.game.kickoff,
          }),
          recommendationOrderKey({
            category: b.category,
            edge: b.edge,
            recommendedSide: b.recommendedSide,
            homeSpread: b.game.homeSpread,
            liveHomeSpread: b.liveHomeSpread,
            consensus: b.consensus,
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
              {slate.pool.seasonYear} season · {slate.pool.entriesCount} entries
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
                checked={upcomingOnly}
                onChange={(event) => {
                  const checked = event.target.checked
                  setUpcomingOnly(checked)
                  if (checked) setCompletedOnly(false)
                }}
              />
              Upcoming only
            </label>
            <label className="upcoming-filter">
              <input
                type="checkbox"
                checked={completedOnly}
                onChange={(event) => {
                  const checked = event.target.checked
                  setCompletedOnly(checked)
                  if (checked) setUpcomingOnly(false)
                }}
              />
              Completed
            </label>
            <button
              className="generate-card-button"
              type="button"
              onClick={() =>
                setSuggestedCard(
                  generateSuggestedCard(
                    analyses.filter(({ game }) =>
                      gameIsUpcoming(game, Date.now()),
                    ),
                    slate.week.label,
                    slate.pool.seasonYear,
                    slate.tiebreaker,
                  ),
                )
              }
            >
              Generate card
            </button>
          </div>

          {suggestedCard && (
            <SuggestedCardPanel
              card={suggestedCard}
              onClose={closeSuggestedCard}
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
                  setUpcomingOnly(false)
                  setCompletedOnly(false)
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
