import { useMemo, useState } from 'react'
import { weeksForSeason } from './careerHistory'
import type {
  EdgeCategory,
  FrozenRecommendation,
  RecommendationHistory,
  RecommendationWeek,
} from './types'
import type { CardPickSource, PickStrength } from './cardScoring'

const TRACKED: Array<Exclude<EdgeCategory, 'pending'>> = [
  'lock',
  'hammer',
  'lean',
  'slight',
  'neutral',
]

const STRENGTHS: PickStrength[] = ['strong', 'solid', 'mild']
const SOURCES: CardPickSource[] = ['line-value', 'public-consensus']

const TIER_LABELS: Record<(typeof TRACKED)[number], string> = {
  lock: 'Locks',
  hammer: 'Hammers',
  lean: 'Leans',
  slight: 'Slights',
  neutral: 'Neutral',
}

const STRENGTH_LABELS: Record<PickStrength, string> = {
  strong: 'Strong',
  solid: 'Solid',
  mild: 'Mild',
}

const SOURCE_LABELS: Record<CardPickSource, string> = {
  'line-value': 'Line value',
  'public-consensus': 'Public',
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
  const side = game.pickedSide ?? game.recommendedSide
  if (!side) return 'No edge'
  const team = game[side]
  const number = game.homeSpread * (side === 'away' ? -1 : 1)
  return `${team} ${formatSpread(number)}`
}

function submittedSide(game: FrozenRecommendation) {
  if (!game.pickedSide) return null
  if (!game.deviated) return game.pickedSide
  return game.pickedSide === 'home' ? 'away' : 'home'
}

function sentLabel(game: FrozenRecommendation) {
  const side = submittedSide(game)
  if (!side || !game.deviated) return null
  const team = game[side]
  const number = game.homeSpread * (side === 'away' ? -1 : 1)
  return `${team} ${formatSpread(number)}`
}

function recResult(game: FrozenRecommendation) {
  if (!game.cover) return null
  if (game.cover === 'push') return 'push'
  if (!game.recommendedSide) return null
  return game.cover === game.recommendedSide ? 'win' : 'loss'
}

function strengthResult(game: FrozenRecommendation) {
  if (!game.cover) return null
  if (game.cover === 'push') return 'push'
  if (!game.pickedSide) return null
  return game.cover === game.pickedSide ? 'win' : 'loss'
}

function submittedResult(game: FrozenRecommendation) {
  if (!game.cover) return null
  if (game.cover === 'push') return 'push'
  const side = submittedSide(game)
  if (!side) return null
  return game.cover === side ? 'win' : 'loss'
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

function summarizeStrength(
  games: FrozenRecommendation[],
  strength: PickStrength,
  source: CardPickSource,
) {
  const rows = games.filter(
    (game) => game.strength === strength && game.source === source,
  )
  const results = rows.map(strengthResult)
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

function summarizeRecommendations(games: FrozenRecommendation[]) {
  const rows = games.filter((game) => game.recommendedSide)
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

function summarizeSource(games: FrozenRecommendation[], source: CardPickSource) {
  const rows = games.filter((game) => game.source === source && game.pickedSide)
  const results = rows.map(strengthResult)
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

function summarizeDeviations(games: FrozenRecommendation[]) {
  const rows = games.filter((game) => game.deviated && game.pickedSide)
  const results = rows.map(submittedResult)
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

function cardResult(game: FrozenRecommendation) {
  if (game.deviated && game.pickedSide) return submittedResult(game)
  if (game.pickedSide) return strengthResult(game)
  return recResult(game)
}

function resultLabel(game: FrozenRecommendation) {
  if (!game.cover) return 'Awaiting result'
  if (game.deviated && game.pickedSide) {
    const result = submittedResult(game)
    if (result === 'push') return 'Push'
    if (result === 'win') return 'Deviation hit'
    if (result === 'loss') return 'Deviation missed'
  }
  if (game.pickedSide) {
    const result = strengthResult(game)
    if (result === 'push') return 'Push'
    if (result === 'win') return 'Win'
    if (result === 'loss') return 'Loss'
  }
  if (game.category === 'neutral') {
    if (game.cover === 'push') return 'Push'
    return game.cover === 'home' ? 'Home covered' : 'Away covered'
  }
  return recResult(game) ?? 'Awaiting result'
}

export default function PerformanceView({
  history,
  seasonYear,
}: {
  history: RecommendationHistory
  seasonYear: number
}) {
  const seasonWeeks = useMemo(
    () => weeksForSeason(history.weeks, seasonYear),
    [history.weeks, seasonYear],
  )
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(
    seasonWeeks.at(-1)?.week ?? 1,
  )
  const selectedWeek: RecommendationWeek | undefined =
    seasonWeeks.find((week) => week.week === selectedWeekNumber) ??
    seasonWeeks.at(-1)

  const allGames = useMemo(
    () => seasonWeeks.flatMap((week) => week.games),
    [seasonWeeks],
  )
  const seasonStats = useMemo(
    () => Object.fromEntries(TRACKED.map((tier) => [tier, summarize(allGames, tier)])),
    [allGames],
  )
  const strengthStats = useMemo(
    () =>
      Object.fromEntries(
        SOURCES.flatMap((source) =>
          STRENGTHS.map((strength) => [
            `${source}:${strength}`,
            summarizeStrength(allGames, strength, source),
          ]),
        ),
      ),
    [allGames],
  )
  const recommendationStats = useMemo(
    () => summarizeRecommendations(allGames),
    [allGames],
  )
  const lineValueStats = useMemo(
    () => summarizeSource(allGames, 'line-value'),
    [allGames],
  )
  const publicStats = useMemo(
    () => summarizeSource(allGames, 'public-consensus'),
    [allGames],
  )
  const deviationStats = useMemo(
    () => summarizeDeviations(allGames),
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
            The top tiles are overall ATS for the frozen Lines
            recommendation, then every line-value card pick and every
            public fill. Tiers and strength sit under that. Deviations
            are games where the completed card sent the other side.
            Games lock at kickoff so a Saturday move cannot rewrite
            Friday&apos;s recommendation.
          </p>
        </div>
        <div className="week-chip">
          <span>Graded recs</span>
          <strong>{graded}</strong>
          <small>
            {seasonWeeks.length} {seasonWeeks.length === 1 ? 'week' : 'weeks'}
          </small>
        </div>
      </section>

      {graded === 0 && (
        <div className="notice">
          Week 1 recommendations are stored, but nothing is graded yet. Win rates
          fill in after games complete and covers are recorded.
        </div>
      )}

      <section
        className="summary-grid performance-overall"
        aria-label="Overall recommendation hit rates"
      >
        <div className="summary-card lock">
          <span>Recommendations</span>
          <strong>{recommendationStats.rate}</strong>
          <small>
            {recommendationStats.count} rec
            {recommendationStats.count === 1 ? '' : 's'} ·{' '}
            {recommendationStats.detail}
          </small>
        </div>
        <div className="summary-card hammer">
          <span>Line value</span>
          <strong>{lineValueStats.rate}</strong>
          <small>
            {lineValueStats.count} rec
            {lineValueStats.count === 1 ? '' : 's'} · {lineValueStats.detail}
          </small>
        </div>
        <div className="summary-card lean">
          <span>Public</span>
          <strong>{publicStats.rate}</strong>
          <small>
            {publicStats.count} rec
            {publicStats.count === 1 ? '' : 's'} · {publicStats.detail}
          </small>
        </div>
      </section>

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

      <div
        className="performance-strength-groups"
        aria-label="Card strength hit rates by source"
      >
        {SOURCES.map((source) => (
          <section key={source} aria-label={`${SOURCE_LABELS[source]} hit rates`}>
            <p className="eyebrow">{SOURCE_LABELS[source]}</p>
            <div className="summary-grid performance-strength">
              {STRENGTHS.map((strength) => {
                const stats = strengthStats[`${source}:${strength}`]
                return (
                  <div
                    className={`summary-card ${strength}`}
                    key={`${source}:${strength}`}
                  >
                    <span>{STRENGTH_LABELS[strength]}</span>
                    <strong>{stats.rate}</strong>
                    <small>
                      {stats.count} rec{stats.count === 1 ? '' : 's'} ·{' '}
                      {stats.detail}
                    </small>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <section
        className="summary-grid performance-deviations"
        aria-label="Deviation hit rate"
      >
        <div className="summary-card slight">
          <span>Deviations</span>
          <strong>{deviationStats.rate}</strong>
          <small>
            {deviationStats.count} flip{deviationStats.count === 1 ? '' : 's'} ·{' '}
            {deviationStats.detail}
          </small>
        </div>
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
              {seasonWeeks.map((week) => (
                <option key={`${week.seasonYear ?? seasonYear}:${week.week}`} value={week.week}>
                  {week.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="week-card">
          <div className="pick-history-list frozen-card-list">
            <div className="history-pick frozen-head" aria-hidden="true">
              <span>Game</span>
              <span>Tier</span>
              <span>Source</span>
              <span>Strength</span>
              <span>Pick</span>
              <span>Result</span>
            </div>
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
                <div className="frozen-cell frozen-tier">
                  <span className={`recommendation ${game.category}`}>
                    {game.category}
                  </span>
                </div>
                <div className="frozen-cell frozen-source">
                  {game.source ? (
                    <span className={`pick-source ${game.source}`}>
                      {SOURCE_LABELS[game.source]}
                    </span>
                  ) : (
                    <span className="frozen-empty">—</span>
                  )}
                </div>
                <div className="frozen-cell frozen-strength">
                  {game.strength ? (
                    <span className={`pick-strength ${game.strength}`}>
                      {game.strength}
                    </span>
                  ) : (
                    <span className="frozen-empty">—</span>
                  )}
                </div>
                <div className="frozen-cell frozen-pick">
                  <strong>{sentLabel(game) ?? recLabel(game)}</strong>
                  {game.deviated && <span className="pick-deviate">Deviate</span>}
                  {game.deviated && <small>rec was {recLabel(game)}</small>}
                  {game.hook && (
                    <small>
                      favorable {game.hook === 'fg' ? 'FG' : 'TD'} hook
                    </small>
                  )}
                </div>
                <span
                  className={`pick-result ${cardResult(game) ?? game.cover ?? 'pending'}`}
                >
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
