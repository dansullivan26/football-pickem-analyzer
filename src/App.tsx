import { useCallback, useEffect, useMemo, useState } from 'react'
import slateData from './data/current-slate.json'
import type {
  BookKey,
  EdgeCategory,
  OddsEvent,
  OddsFeed,
  Slate,
  SlateGame,
} from './types'

const slate = slateData as Slate
const bookNames: Record<BookKey, string> = {
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
}

type GameAnalysis = {
  game: SlateGame
  odds: OddsEvent | undefined
  liveHomeSpread: number | null
  edge: number | null
  category: EdgeCategory
  recommendedSide: 'home' | 'away' | null
}

function formatSpread(value: number | null | undefined) {
  if (value == null) return '—'
  if (value === 0) return 'PK'
  return value > 0 ? `+${value}` : `${value}`
}

function formatUpdatedAt(value: string | null) {
  if (!value) return 'Waiting for first odds refresh'
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))}`
}

function analyzeGame(game: SlateGame, odds: OddsEvent | undefined): GameAnalysis {
  const availableLines = odds
    ? Object.values(odds.lines).filter((line): line is number => typeof line === 'number')
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

  const liveHomeSpread =
    availableLines.reduce((total, line) => total + line, 0) / availableLines.length
  const edge = game.homeSpread - liveHomeSpread
  const magnitude = Math.abs(edge)

  return {
    game,
    odds,
    liveHomeSpread,
    edge: magnitude,
    category: magnitude >= 3 ? 'hammer' : magnitude >= 1.5 ? 'lean' : 'neutral',
    recommendedSide: edge > 0 ? 'home' : edge < 0 ? 'away' : null,
  }
}

function Recommendation({ analysis }: { analysis: GameAnalysis }) {
  const { game, category, edge, recommendedSide } = analysis
  if (category === 'pending') {
    return (
      <div className="recommendation pending">
        <span className="category-dot" />
        Awaiting odds
      </div>
    )
  }

  const team = recommendedSide ? game[recommendedSide] : null
  return (
    <div>
      <div className={`recommendation ${category}`}>
        <span className="category-dot" />
        {category}
      </div>
      <div className="edge-copy">
        {team ? `${team.abbrev} +${edge?.toFixed(1)} pts` : 'No line edge'}
      </div>
    </div>
  )
}

function GameCard({ analysis }: { analysis: GameAnalysis }) {
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
        </div>
        {(Object.keys(bookNames) as BookKey[]).map((book) => (
          <div className="line-cell" key={book}>
            <span>{bookNames[book]}</span>
            <strong>{formatSpread(odds?.lines[book])}</strong>
          </div>
        ))}
      </div>

      <div className="card-footer">
        <Recommendation analysis={analysis} />
        <span className="spread-note">All lines shown for {game.home.abbrev}</span>
      </div>
    </article>
  )
}

function App() {
  const [feed, setFeed] = useState<OddsFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<EdgeCategory | 'all'>('all')
  const [query, setQuery] = useState('')

  const loadOdds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`./data/odds.json?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`Odds feed returned ${response.status}`)
      setFeed((await response.json()) as OddsFeed)
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
        { hammer: 0, lean: 0, neutral: 0, pending: 0 },
      ),
    [analyses],
  )

  const visibleGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return analyses.filter(({ game, category }) => {
      const matchesFilter = filter === 'all' || category === filter
      const matchesQuery =
        !normalizedQuery ||
        [game.away.name, game.away.abbrev, game.home.name, game.home.abbrev].some(
          (value) => value.toLowerCase().includes(normalizedQuery),
        )
      return matchesFilter && matchesQuery
    })
  }, [analyses, filter, query])

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Pick'em Edge home">
          <span className="brand-mark">PE</span>
          <span>Pick&apos;em Edge</span>
        </a>
        <div className="header-actions">
          <span className="feed-status">{formatUpdatedAt(feed?.updatedAt ?? null)}</span>
          <button className="refresh-button" type="button" onClick={loadOdds} disabled={loading}>
            <span aria-hidden="true">↻</span>
            {loading ? 'Refreshing…' : 'Refresh lines'}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">
              {slate.pool.seasonYear} season · {slate.pool.entriesCount} entries
            </p>
            <h1>{slate.pool.name}</h1>
            <p className="hero-copy">
              Compare the pool&apos;s locked line with DraftKings and FanDuel.
              Recommendations use the average available live spread.
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
            <small>1.5–2.9 points</small>
          </button>
          <button className="summary-card neutral" onClick={() => setFilter('neutral')}>
            <span>Neutral</span>
            <strong>{counts.neutral}</strong>
            <small>Under 1.5 points</small>
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
                  <option value="neutral">Neutral</option>
                  <option value="pending">Awaiting lines</option>
                </select>
              </label>
            </div>
          </div>

          <div className="game-list">
            {visibleGames.map((analysis) => (
              <GameCard key={analysis.game.cbsEventId} analysis={analysis} />
            ))}
          </div>

          {visibleGames.length === 0 && (
            <div className="empty-state">
              No games match this filter.{' '}
              <button type="button" onClick={() => { setFilter('all'); setQuery('') }}>
                Clear filters
              </button>
            </div>
          )}
        </section>
      </main>

      <footer>
        CBS line captured{' '}
        {new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(slate.source.fetchedAt))}
        . Sportsbook data provided by SharpAPI.
      </footer>
    </div>
  )
}

export default App
