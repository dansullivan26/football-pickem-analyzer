import { useCallback, useEffect, useMemo, useState } from 'react'
import slateData from './data/current-slate.json'
import playerHistoryData from './data/player-history.json'
import recommendationHistoryData from './data/recommendation-history.json'
import PlayersView from './PlayersView'
import PerformanceView from './PerformanceView'
import type {
  BookKey,
  EdgeCategory,
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
const bookNames: Record<BookKey, string> = {
  draftkings: 'DraftKings',
}

type GameAnalysis = {
  game: SlateGame
  odds: OddsEvent | undefined
  liveHomeSpread: number | null
  edge: number | null
  category: EdgeCategory
  recommendedSide: 'home' | 'away' | null
}

// Spreads move in half points; keep a single book on that grid.
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

function classifyEdge(magnitude: number): EdgeCategory {
  if (magnitude >= 3) return 'hammer'
  if (magnitude >= 1.5) return 'lean'
  if (magnitude > 0) return 'slight'
  return 'neutral'
}

// The .5 that sits on either side of a field goal (3) or touchdown (7).
// If the pool and the book are 2.5 vs 3.5 (or 6.5 vs 7.5), the better
// number is always the side of that hook, so a recommendation already
// points at the team that benefits.
function favorableHook(poolHome: number, bookHome: number): 'fg' | 'td' | null {
  if (poolHome === 0 || bookHome === 0) return null
  if (Math.sign(poolHome) !== Math.sign(bookHome)) return null

  const pair = new Set([Math.abs(poolHome), Math.abs(bookHome)])
  if (pair.has(2.5) && pair.has(3.5)) return 'fg'
  if (pair.has(6.5) && pair.has(7.5)) return 'td'
  return null
}

function analyzeGame(game: SlateGame, odds: OddsEvent | undefined): GameAnalysis {
  const availableLines = odds
    ? Object.values(odds.lines)
        .map((entry) => entry?.line)
        .filter((line): line is number => typeof line === 'number')
    : []

  if (availableLines.length === 0) {
    return {
      game,
      odds,
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
    liveHomeSpread,
    edge: magnitude,
    category: classifyEdge(magnitude),
    recommendedSide: edge > 0 ? 'home' : edge < 0 ? 'away' : null,
  }
}

function Recommendation({ analysis }: { analysis: GameAnalysis }) {
  const { game, category, recommendedSide } = analysis
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
          {category}
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
        {team.abbrev} {formatSpread(poolNumber)}
      </div>
      <div className={`recommendation ${category}`}>
        <span className="category-dot" />
        {category}
      </div>
      {hook && (
        <div className="hook-badge">
          favorable {hook === 'fg' ? 'FG' : 'TD'} hook
        </div>
      )}
    </div>
  )
}

function GameCard({ analysis, now }: { analysis: GameAnalysis; now: number }) {
  const { game, odds } = analysis
  return (
    <article className="game-card">
      <div className="game-meta">
        <span className={`sport-tag ${game.sport.toLowerCase()}`}>{game.sport}</span>
        <time dateTime={game.kickoff}>{game.kickoffLabel.replace(' ET', '')}</time>
        {game.tv && <span>{game.tv}</span>}
      </div>

      <div className="matchup">
        <div className="team">
          <span className="team-abbrev">{game.away.abbrev}</span>
          <span className="team-name">{game.away.name}</span>
        </div>
        <span className="at">@</span>
        <div className="team">
          <span className="team-abbrev">{game.home.abbrev}</span>
          <span className="team-name">{game.home.name}</span>
        </div>
      </div>

      <div className="line-grid">
        <div className="line-cell locked">
          <span>CBS locked</span>
          <strong>{formatSpread(game.homeSpread)}</strong>
          <em>pool line</em>
        </div>
        {(Object.keys(bookNames) as BookKey[]).map((book) => {
          const entry = odds?.lines[book]
          const stale =
            !!entry && now - new Date(entry.retrievedAt).getTime() > STALE_AFTER_MS
          return (
            <div className={`line-cell${stale ? ' stale' : ''}`} key={book}>
              <span>{bookNames[book]}</span>
              <strong>{formatSpread(entry?.line)}</strong>
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
        <span className="spread-note">All lines shown for {game.home.abbrev}</span>
      </div>
    </article>
  )
}

function App() {
  const [view, setView] = useState<'lines' | 'players' | 'performance'>('lines')
  const [feed, setFeed] = useState<OddsFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<EdgeCategory | 'all'>('all')
  const [league, setLeague] = useState<'all' | 'NCAAF' | 'NFL'>('all')
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const loadOdds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`./data/odds.json?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`Odds feed returned ${response.status}`)
      setFeed((await response.json()) as OddsFeed)
      setNow(Date.now())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load odds')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial external data synchronization; later refreshes are user initiated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOdds()
  }, [loadOdds])

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
    return analyses.filter(({ game, category }) => {
      const matchesFilter = filter === 'all' || category === filter
      const matchesLeague = league === 'all' || game.sport === league
      const matchesQuery =
        !normalizedQuery ||
        [game.away.name, game.away.abbrev, game.home.name, game.home.abbrev].some(
          (value) => value.toLowerCase().includes(normalizedQuery),
        )
      return matchesFilter && matchesLeague && matchesQuery
    })
  }, [analyses, filter, league, query])

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Pick'em Edge home">
          <span className="brand-mark">PE</span>
          <span>Pick&apos;em Edge</span>
        </a>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button
            className={view === 'lines' ? 'active' : ''}
            type="button"
            onClick={() => setView('lines')}
          >
            Lines
          </button>
          <button
            className={view === 'players' ? 'active' : ''}
            type="button"
            onClick={() => setView('players')}
          >
            Players
          </button>
          <button
            className={view === 'performance' ? 'active' : ''}
            type="button"
            onClick={() => setView('performance')}
          >
            Performance
          </button>
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
                onClick={loadOdds}
                disabled={loading}
              >
                <span aria-hidden="true">↻</span>
                {loading ? 'Refreshing…' : 'Refresh lines'}
              </button>
            </>
          )}
        </div>
      </header>

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
          <div className="week-chip">
            <span>Current slate</span>
            <strong>{slate.week.label}</strong>
            <small>{slate.week.gamesOnSlate} games</small>
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

        <section className="summary-grid" aria-label="Recommendation summary">
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
        </section>

        <section className="slate-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Against the spread</p>
              <h2>Slate comparison</h2>
            </div>
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
            </div>
          </div>

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
        <PlayersView history={playerHistory} />
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
