import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import consensusData from './data/consensus.json'
import slateData from './data/current-slate.json'
import playerHistoryData from './data/player-history.json'
import recommendationHistoryData from './data/recommendation-history.json'
import predictionForecastsData from './data/prediction-forecasts.json'
import PlayersView from './PlayersView'
import PerformanceView from './PerformanceView'
import SuggestedCardPanel from './SuggestedCardPanel'
import TeamLogo from './TeamLogo'
import { publicBucketForPool, favorableHook, publicSupportForSide, PUBLIC_SUPPORT_RANK } from './cardScoring'
import { generateSuggestedCard, type SuggestedCard } from './cardStrategy'
import { dispatchReviewRefresh } from './dispatchRefresh'
import { pathForView, viewFromPath, type AppView } from './routes'
import type { PredictionForecasts } from './playerPrediction'
import type {
  BookKey,
  ConsensusFeed,
  ConsensusGame,
  EdgeCategory,
  GameAnalysis,
  GameVenue,
  OddsEvent,
  OddsFeed,
  PlayerHistory,
  RecommendationHistory,
  Slate,
  SlateGame,
} from './types'

const slate = slateData as Slate
const playerHistory = playerHistoryData as PlayerHistory
const recommendationHistory = recommendationHistoryData as RecommendationHistory
const predictionForecasts = predictionForecastsData as PredictionForecasts
const consensusFeed = consensusData as ConsensusFeed
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

function classifyEdge(magnitude: number): EdgeCategory {
  if (magnitude >= 3) return 'hammer'
  if (magnitude >= 1.5) return 'lean'
  if (magnitude > 0) return 'slight'
  return 'neutral'
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
    return (
      <div className="recommendation-block">
        <div className="edge-label">Line Value</div>
        <div className="edge-copy none">No edge</div>
        <div className={`recommendation ${category}`}>
          <span className="category-dot" />
          {band}
        </div>
      </div>
    )
  }

  const team = game[recommendedSide]
  const poolNumber = game.homeSpread * (recommendedSide === 'away' ? -1 : 1)
  const hook =
    analysis.liveHomeSpread == null
      ? null
      : favorableHook(game.homeSpread, analysis.liveHomeSpread)

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

  const picks = (away.picks ?? 0) + (home.picks ?? 0)
  const captured = formatAge(consensusFeed.source.fetchedAt, now)
  const currentSides = [away, home]
    .map((side) => `${side.name} ${formatSpread(side.spread)}`)
    .join(' · ')
  const leader = home.pct > away.pct ? home : away
  const split = away.pct === home.pct
  const headlineParts = [
    split ? `Public split ${leader.pct}%` : `Public ${leader.pct}% ${leader.name}`,
    `· ${picks} picks`,
  ]
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
      `Near pool: ${bucketLeader.name} ${Math.round((leaderPicks / bucketPicks) * 100)}%`,
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
      <em>
        <NoteParts parts={headlineParts} />
      </em>
    </span>
  )
}

const CATEGORY_RANK: Record<EdgeCategory, number> = {
  hammer: 0,
  lean: 1,
  slight: 2,
  neutral: 3,
  pending: 4,
}

function GameCard({ analysis, now }: { analysis: GameAnalysis; now: number }) {
  const { game, odds, category } = analysis
  const venue = formatVenue(game.venue)
  const isTiebreaker = game.id === slate.tiebreaker?.gameId
  return (
    <article className={`game-card ${category}`}>
      <div className="game-meta">
        <span className={`sport-tag ${game.sport.toLowerCase()}`}>{game.sport}</span>
        <time dateTime={game.kickoff}>{game.kickoffLabel.replace(' ET', '')}</time>
        {game.tv && <span>{game.tv}</span>}
        {venue && (
          <span
            className="game-venue"
            title={game.venue?.indoor ? `${venue} (indoor)` : venue}
          >
            {venue}
          </span>
        )}
      </div>

      <div className="matchup">
        <div className="team">
          <TeamLogo team={game.away} />
          <span className="team-name">{game.away.name}</span>
        </div>
        <span className="at">@</span>
        <div className="team">
          <TeamLogo team={game.home} />
          <span className="team-name">{game.home.name}</span>
        </div>
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
          const stale =
            !!entry && now - new Date(entry.retrievedAt).getTime() > STALE_AFTER_MS
          return (
            <div className={`line-cell${stale ? ' stale' : ''}`} key={book}>
              <span>{bookNames[book]}</span>
              <strong>{formatSpread(entry?.line)}</strong>
              {entry?.previousLine != null && (
                <span className="line-move">
                  was {formatSpread(entry.previousLine)}
                </span>
              )}
              {total && (
                <span className="line-total">
                  O/U {formatPoints(total.line)}
                  {total.previousLine != null
                    ? ` · was ${formatPoints(total.previousLine)}`
                    : ''}
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
        <div className="card-notes">
          <span className="spread-note">All lines shown for {game.home.name}</span>
          <ConsensusNote consensus={analysis.consensus} now={now} />
        </div>
      </div>
    </article>
  )
}

function App() {
  const [view, setView] = useState<AppView>(() => viewFromPath())
  const [feed, setFeed] = useState<OddsFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<EdgeCategory | 'all'>('all')
  const [sort, setSort] = useState<'kickoff' | 'recommendation'>('kickoff')
  const [league, setLeague] = useState<'all' | 'NCAAF' | 'NFL'>('all')
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [suggestedCard, setSuggestedCard] = useState<SuggestedCard | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const closeSuggestedCard = useCallback(() => setSuggestedCard(null), [])

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

  const goTo = useCallback((next: AppView) => {
    const path = pathForView(next)
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState(null, '', path)
    }
    setView(next)
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
    function onPopState() {
      setView(viewFromPath())
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

  const counts = useMemo(
    () =>
      analyses.reduce(
        (totals, analysis) => {
          totals[analysis.category] += 1
          return totals
        },
        { hammer: 0, lean: 0, slight: 0, neutral: 0, pending: 0 },
      ),
    [analyses],
  )

  const visibleGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = analyses.filter(({ game, category }) => {
      const matchesFilter = filter === 'all' || category === filter
      const matchesLeague = league === 'all' || game.sport === league
      const matchesQuery =
        !normalizedQuery ||
        [game.away.name, game.away.abbrev, game.home.name, game.home.abbrev].some(
          (value) => value.toLowerCase().includes(normalizedQuery),
        )
      return matchesFilter && matchesLeague && matchesQuery
    })

    if (sort !== 'recommendation') return filtered

    return [...filtered].sort((a, b) => {
      const category = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]
      if (category) return category
      const edge = (b.edge ?? -1) - (a.edge ?? -1)
      if (edge) return edge
      const publicSupport =
        PUBLIC_SUPPORT_RANK[
          publicSupportForSide(b.consensus, b.game.homeSpread, b.recommendedSide)
        ] -
        PUBLIC_SUPPORT_RANK[
          publicSupportForSide(a.consensus, a.game.homeSpread, a.recommendedSide)
        ]
      if (publicSupport) return publicSupport
      return a.game.kickoff.localeCompare(b.game.kickoff)
    })
  }, [analyses, filter, league, query, sort])

  const lineMoves = useMemo(() => {
    const spreads = analyses.filter((analysis) =>
      (Object.keys(bookNames) as BookKey[]).some((book) => {
        const entry = analysis.odds?.lines[book]
        return entry?.previousLine != null && entry.previousLine !== entry.line
      }),
    ).length
    const totals = analyses.filter((analysis) =>
      (Object.keys(bookNames) as BookKey[]).some((book) => {
        const entry = analysis.odds?.totals?.[book]
        return entry?.previousLine != null && entry.previousLine !== entry.line
      }),
    ).length
    return { spreads, totals }
  }, [analyses])

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
            className={view === 'performance' ? 'active' : ''}
            href={pathForView('performance')}
            onClick={(event) => {
              event.preventDefault()
              goTo('performance')
            }}
          >
            Performance
          </a>
        </nav>
        <div className="header-actions">
          {view === 'lines' && (
            <>
              <span className="feed-status">
                {formatUpdatedAt(feed?.updatedAt ?? null)}
              </span>
              <button
                className="refresh-button"
                type="button"
                onClick={() => void refreshData()}
                disabled={dispatching}
              >
                <span aria-hidden="true">↻</span>
                {dispatching ? 'Starting…' : 'Refresh data'}
              </button>
            </>
          )}
        </div>
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
        <section className="hero">
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
            <button className="summary-card hammer" onClick={() => setFilter('hammer')}>
              <span>Hammers</span>
              <strong>{counts.hammer}</strong>
              <small>3+ point edge</small>
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
                  setSort(event.target.value as 'kickoff' | 'recommendation')
                }
              >
                <option value="kickoff">Kickoff time</option>
                <option value="recommendation">Recommendation</option>
              </select>
            </label>
            <button
              className="generate-card-button"
              type="button"
              onClick={() =>
                setSuggestedCard(
                  generateSuggestedCard(
                    analyses,
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
            <p
              className="list-meta"
              title={formatTimestamp(consensusFeed.source.fetchedAt)}
            >
              Covers.com data collected {formatAge(consensusFeed.source.fetchedAt, now)}
            </p>
          )}
          {(lineMoves.spreads > 0 || lineMoves.totals > 0) && (
            <p
              className="list-meta"
              title={
                feed?.comparedTo
                  ? `Compared with the pull from ${formatTimestamp(feed.comparedTo)}`
                  : undefined
              }
            >
              {lineMoves.spreads > 0
                ? `${lineMoves.spreads} DraftKings spread${
                    lineMoves.spreads === 1 ? '' : 's'
                  } moved since the last pull.`
                : ''}
              {lineMoves.spreads > 0 && lineMoves.totals > 0 ? ' ' : ''}
              {lineMoves.totals > 0
                ? 'Tiebreaker total moved since the last pull.'
                : ''}
            </p>
          )}

          <div className="game-list">
            {visibleGames.map((analysis) => (
              <GameCard
                key={analysis.game.cbsEventId}
                analysis={analysis}
                now={now}
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
                  setQuery('')
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
          history={playerHistory}
          recommendations={recommendationHistory}
          forecasts={predictionForecasts}
        />
      ) : (
        <PerformanceView history={recommendationHistory} />
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
