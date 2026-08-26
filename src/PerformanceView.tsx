import { useMemo, useState } from 'react'
import type {
  EdgeCategory,
  FrozenRecommendation,
  RecommendationHistory,
  RecommendationWeek,
} from './types'

const TRACKED: Array<Exclude<EdgeCategory, 'pending'>> = [
  'hammer',
  'lean',
  'slight',
  'neutral',
]

const TIER_LABELS: Record<(typeof TRACKED)[number], string> = {
  hammer: 'Hammers',
  lean: 'Leans',
  slight: 'Slights',
  neutral: 'Neutral',
}

function formatSpread(value: number | null | undefined) {
  if (value == null) return '—'
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? String(Math.abs(value))
    : Math.abs(value).toFixed(1)
  return value > 0 ? `+${points}` : `-${points}`
}

function recLabel(game: FrozenRecommendation) {
  if (game.category === 'pending' || !game.recommendedSide) return 'No edge'
  const team = game[game.recommendedSide]
  const number =
    game.homeSpread * (game.recommendedSide === 'away' ? -1 : 1)
  return `${team} ${formatSpread(number)}`
}

function recResult(game: FrozenRecommendation) {
  if (!game.cover) return null
  if (game.cover === 'push') return 'push'
  if (!game.recommendedSide) return null
  return game.cover === game.recommendedSide ? 'win' : 'loss'
}

function formatRate(wins: number, losses: number) {
  const decided = wins + losses
  if (!decided) return '—'
  return `${Math.round((wins / decided) * 100)}%`
}

function summarize(
  games: FrozenRecommendation[],
  category: Exclude<EdgeCategory, 'pending'>,
) {
  const rows = games.filter((game) => game.category === category)
  if (category === 'neutral') {
    const covers = rows.filter((game) => game.cover === 'home').length
    const fails = rows.filter((game) => game.cover === 'away').length
    const pushes = rows.filter((game) => game.cover === 'push').length
    return {
      count: rows.length,
      wins: covers,
      losses: fails,
      pushes,
      pending: rows.filter((game) => !game.cover).length,
      rate: formatRate(covers, fails),
      detail: 'Home ATS as a control',
    }
  }

  const results = rows.map(recResult)
  const wins = results.filter((result) => result === 'win').length
  const losses = results.filter((result) => result === 'loss').length
  const pushes = results.filter((result) => result === 'push').length
  return {
    count: rows.length,
    wins,
    losses,
    pushes,
    pending: results.filter((result) => result == null).length,
    rate: formatRate(wins, losses),
    detail: `${wins}-${losses}${pushes ? `-${pushes}` : ''} ATS`,
  }
}

function resultLabel(game: FrozenRecommendation) {
  if (!game.cover) return 'Awaiting result'
  if (game.category === 'neutral') {
    if (game.cover === 'push') return 'Push'
    return game.cover === 'home' ? 'Home covered' : 'Away covered'
  }
  return recResult(game) ?? 'Awaiting result'
}

export default function PerformanceView({
  history,
}: {
  history: RecommendationHistory
}) {
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(
    history.weeks.at(-1)?.week ?? 1,
  )
  const selectedWeek: RecommendationWeek | undefined =
    history.weeks.find((week) => week.week === selectedWeekNumber) ??
    history.weeks.at(-1)

  const allGames = useMemo(
    () => history.weeks.flatMap((week) => week.games),
    [history.weeks],
  )
  const seasonStats = useMemo(
    () => Object.fromEntries(TRACKED.map((tier) => [tier, summarize(allGames, tier)])),
    [allGames],
  )
  const graded = allGames.filter((game) => game.cover).length

  return (
    <main>
      <section className="hero players-hero">
        <div>
          <p className="eyebrow">Model tracker</p>
          <h1>Recommendation performance</h1>
          <p className="hero-copy">
            Hit rates for frozen picks, by tier. Games lock at kickoff so a
            Saturday move cannot rewrite Friday&apos;s recommendation.
          </p>
        </div>
        <div className="week-chip">
          <span>Graded recs</span>
          <strong>{graded}</strong>
          <small>
            {history.weeks.length} {history.weeks.length === 1 ? 'week' : 'weeks'}
          </small>
        </div>
      </section>

      {graded === 0 && (
        <div className="notice">
          Week 1 recommendations are stored, but nothing is graded yet. Win rates
          fill in after games complete and covers are recorded.
        </div>
      )}

      <section className="summary-grid performance-summary" aria-label="Season hit rates">
        {TRACKED.map((tier) => {
          const stats = seasonStats[tier]
          return (
            <div className={`summary-card ${tier}`} key={tier}>
              <span>{TIER_LABELS[tier]}</span>
              <strong>{stats.rate}</strong>
              <small>
                {stats.count} rec{stats.count === 1 ? '' : 's'} · {stats.detail}
              </small>
            </div>
          )
        })}
      </section>

      <section className="player-detail performance-week">
        <div className="player-detail-heading">
          <div>
            <p className="eyebrow">Frozen card</p>
            <h2>{selectedWeek?.label ?? 'No weeks yet'}</h2>
          </div>
          <label>
            <span className="sr-only">Select week</span>
            <select
              value={selectedWeek?.week}
              onChange={(event) => setSelectedWeekNumber(Number(event.target.value))}
            >
              {history.weeks.map((week) => (
                <option key={week.week} value={week.week}>
                  {week.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="week-card">
          <div className="pick-history-list">
            {selectedWeek?.games.map((game) => (
              <div className="history-pick" key={game.cbsEventId}>
                <div className="history-matchup">
                  <span>{game.sport}</span>
                  <strong>
                    {game.away} @ {game.home}
                  </strong>
                  <small>
                    CBS {game.home} {formatSpread(game.homeSpread)}
                    {game.liveHomeSpread != null
                      ? ` · Book ${formatSpread(game.liveHomeSpread)}`
                      : ''}
                  </small>
                </div>
                <div className="history-selection">
                  <span className={`recommendation ${game.category}`}>
                    {game.category}
                  </span>
                  <strong>{recLabel(game)}</strong>
                  {game.hook && (
                    <small>
                      favorable {game.hook === 'fg' ? 'FG' : 'TD'} hook
                    </small>
                  )}
                </div>
                <span className={`pick-result ${recResult(game) ?? game.cover ?? 'pending'}`}>
                  {resultLabel(game)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
