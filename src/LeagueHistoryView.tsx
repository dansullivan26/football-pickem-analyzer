import { useMemo, useState } from 'react'
import {
  activeHistoricalPeriods,
  completedCurrentWeeks,
  currentMoneyPace,
  finalMoneyLine,
  historicalWeeklyBenchmarks,
  moneyPaceForSeason,
  returningMoneyFinishers,
  type MoneyPacePoint,
} from './leagueHistory'
import { formatMoneyPlace } from './moneyHistory'
import { playerSlug } from './playerDirectory'
import { pathForPlayer } from './routes'
import type { SeasonHistoryFile } from './seasonHistory'
import type { PlayerHistory } from './types'

type PaceSeries = {
  label: string
  className: string
  points: MoneyPacePoint[]
}

function formatScore(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function middle(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[index] ?? null)
    : ((sorted[index - 1] ?? 0) + (sorted[index] ?? 0)) / 2
}

function PaceChart({ series }: { series: PaceSeries[] }) {
  const width = 720
  const height = 270
  const left = 42
  const right = 16
  const top = 14
  const bottom = 34
  const maxWeek = Math.max(
    1,
    ...series.flatMap((row) => row.points.map((point) => point.activeWeek)),
  )
  const maxScore = Math.max(
    1,
    ...series.flatMap((row) =>
      row.points.map((point) => point.thirdPlaceScore),
    ),
  )
  const x = (week: number) =>
    left + ((week - 1) / Math.max(1, maxWeek - 1)) * (width - left - right)
  const y = (score: number) =>
    top + (1 - score / maxScore) * (height - top - bottom)
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((share) =>
    Math.round(maxScore * share),
  )

  return (
    <div className="history-pace-chart">
      <div className="history-chart-legend" aria-hidden="true">
        {series.map((row) => (
          <span className={row.className} key={row.label}>
            {row.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Third-place cumulative score by active pool week"
      >
        {gridValues.map((score) => (
          <g key={score}>
            <line
              className="history-chart-grid"
              x1={left}
              x2={width - right}
              y1={y(score)}
              y2={y(score)}
            />
            <text className="history-chart-axis" x={left - 8} y={y(score) + 4}>
              {score}
            </text>
          </g>
        ))}
        {[1, 5, 10, 15, 20, maxWeek]
          .filter(
            (week, index, rows) =>
              week <= maxWeek && rows.indexOf(week) === index,
          )
          .map((week) => (
            <text
              className="history-chart-axis"
              key={week}
              x={x(week)}
              y={height - 8}
              textAnchor="middle"
            >
              W{week}
            </text>
          ))}
        {series.map((row) => (
          <g className={row.className} key={row.label}>
            <polyline
              className="history-chart-line"
              points={row.points
                .map(
                  (point) =>
                    `${x(point.activeWeek)},${y(point.thirdPlaceScore)}`,
                )
                .join(' ')}
            />
            {row.points.map((point) => (
              <circle
                className="history-chart-point"
                key={point.activeWeek}
                cx={x(point.activeWeek)}
                cy={y(point.thirdPlaceScore)}
                r={row.className === 'current' ? 4 : 2.4}
              >
                <title>
                  {row.label} after active week {point.activeWeek}: third-place
                  score {point.thirdPlaceScore}
                </title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}

export default function LeagueHistoryView({
  archive,
  current,
  onSelectPlayer,
}: {
  archive: SeasonHistoryFile
  current: PlayerHistory
  onSelectPlayer: (slug: string) => void
}) {
  const seasons = useMemo(
    () =>
      [...archive.seasons].sort(
        (left, right) => right.seasonYear - left.seasonYear,
      ),
    [archive.seasons],
  )
  const [selectedYear, setSelectedYear] = useState(
    seasons[0]?.seasonYear ?? current.pool.seasonYear,
  )
  const selectedSeason =
    seasons.find((season) => season.seasonYear === selectedYear) ?? seasons[0]
  const currentPace = useMemo(() => currentMoneyPace(current), [current])
  const completedWeeks = completedCurrentWeeks(current)
  const paceByYear = useMemo(
    () =>
      new Map(
        seasons.map((season) => [
          season.seasonYear,
          moneyPaceForSeason(season),
        ]),
      ),
    [seasons],
  )
  const benchmarks = useMemo(
    () => historicalWeeklyBenchmarks(archive),
    [archive],
  )
  const selectedBenchmarks = benchmarks.filter(
    (row) => row.seasonYear === selectedSeason?.seasonYear,
  )
  const returning = useMemo(
    () => returningMoneyFinishers(archive, current),
    [archive, current],
  )
  const currentRosterSlugs = new Set(
    current.entries.map((entry) => playerSlug(entry.name)),
  )
  const checkpoint = currentPace.at(-1)
  const paceSeries: PaceSeries[] = [
    {
      label: String(current.pool.seasonYear),
      className: 'current',
      points: currentPace,
    },
    ...seasons.map((season, index) => ({
      label: String(season.seasonYear),
      className: index === 0 ? 'prior-one' : 'prior-two',
      points: paceByYear.get(season.seasonYear) ?? [],
    })),
  ]

  return (
    <main>
      <section className="hero players-hero">
        <div>
          <p className="eyebrow">Football Fanatics archive</p>
          <h1>League history</h1>
          <p className="hero-copy">
            Compare this season&apos;s money pace with CBS&apos;s weekly
            standings from prior pool editions. Top three finish in the money.
            Historical weekly highs are score leaders before any tiebreaker,
            not official weekly winners.
          </p>
        </div>
        <div className="hero-aside">
          <div className="week-chip">
            <span>Archive loaded</span>
            <strong>{seasons.length} seasons</strong>
            <small>
              {benchmarks.length} active weekly scoreboards
            </small>
          </div>
        </div>
      </section>

      <section className="history-summary" aria-label="Money pace summary">
        <article className="history-summary-current">
          <span>{current.pool.seasonYear} checkpoint</span>
          <strong>
            {checkpoint ? checkpoint.thirdPlaceScore : '—'}
          </strong>
          <small>
            Third-place score after {completedWeeks.length} officially scored{' '}
            {completedWeeks.length === 1 ? 'week' : 'weeks'}
          </small>
        </article>
        {seasons.map((season) => {
          const samePoint = (paceByYear.get(season.seasonYear) ?? []).find(
            (point) => point.activeWeek === completedWeeks.length,
          )
          return (
            <article key={season.seasonYear}>
              <span>{season.seasonYear} at the same point</span>
              <strong>{samePoint?.thirdPlaceScore ?? '—'}</strong>
              <small>
                Final money line {finalMoneyLine(season) ?? '—'} ·{' '}
                {season.standings.length} entries
              </small>
            </article>
          )
        })}
      </section>

      <section className="history-section">
        <div className="history-section-heading">
          <div>
            <p className="eyebrow">Money pace</p>
            <h2>Third-place score by active week</h2>
          </div>
          <p>
            Empty CBS periods are skipped. {current.pool.seasonYear} includes
            officially scored weeks only, so the in-progress week does not get
            compared with a finished historical week.
          </p>
        </div>
        <PaceChart series={paceSeries} />
        <details className="history-detail-table">
          <summary>View every pace checkpoint</summary>
          <div className="history-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Active week</th>
                  <th scope="col">{current.pool.seasonYear}</th>
                  {seasons.map((season) => (
                    <th scope="col" key={season.seasonYear}>
                      {season.seasonYear}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  {
                    length: Math.max(
                      0,
                      ...paceSeries.map((row) => row.points.length),
                    ),
                  },
                  (_, index) => index + 1,
                ).map((activeWeek) => (
                  <tr key={activeWeek}>
                    <th scope="row">{activeWeek}</th>
                    {paceSeries.map((row) => {
                      const point = row.points.find(
                        (candidate) =>
                          candidate.activeWeek === activeWeek,
                      )
                      return (
                        <td key={row.label}>
                          {point ? (
                            <>
                              <strong>{point.thirdPlaceScore}</strong>
                              <small>leader {point.leaderScore}</small>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="history-section">
        <div className="history-section-heading history-section-controls">
          <div>
            <p className="eyebrow">Weekly score benchmark</p>
            <h2>What led the pool each week</h2>
          </div>
          <label>
            <span>Season</span>
            <select
              value={selectedSeason?.seasonYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {seasons.map((season) => (
                <option value={season.seasonYear} key={season.seasonYear}>
                  {season.seasonYear}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="history-section-note">
          Raw weekly scores are intentional: late NFL playoff slates naturally
          fall to two or three picks. “High score” can include a tie and does
          not resolve the CBS tiebreaker.
        </p>
        <div className="history-benchmark-summary">
          <article>
            <span>Median weekly high</span>
            <strong>
              {formatScore(
                middle(selectedBenchmarks.map((row) => row.highScore)) ?? 0,
              )}
            </strong>
          </article>
          <article>
            <span>Highest weekly score</span>
            <strong>
              {Math.max(
                0,
                ...selectedBenchmarks.map((row) => row.highScore),
              )}
            </strong>
          </article>
          <article>
            <span>Weeks with co-high scores</span>
            <strong>
              {
                selectedBenchmarks.filter((row) => row.coHighCount > 1)
                  .length
              }
            </strong>
          </article>
        </div>
        <div className="history-table-scroll">
          <table className="history-score-table">
            <thead>
              <tr>
                <th scope="col">CBS period</th>
                <th scope="col">High</th>
                <th scope="col">Third-high</th>
                <th scope="col">Pool median</th>
                <th scope="col">At high</th>
              </tr>
            </thead>
            <tbody>
              {selectedBenchmarks.map((row) => (
                <tr key={`${row.seasonYear}:${row.periodOrder}`}>
                  <th scope="row">
                    {row.periodLabel}
                    {row.periodOrder !== row.activeWeek && (
                      <small>active week {row.activeWeek}</small>
                    )}
                  </th>
                  <td>{row.highScore}</td>
                  <td>{row.thirdScore}</td>
                  <td>{formatScore(row.medianScore)}</td>
                  <td>{row.coHighCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="history-section">
        <div className="history-section-heading">
          <div>
            <p className="eyebrow">Money alumni</p>
            <h2>Past cashers back in {current.pool.seasonYear}</h2>
          </div>
          <p>
            Current rank and score use officially scored weeks only. Historical
            entry IDs change, so returning players join by normalized CBS
            display name.
          </p>
        </div>
        <div className="history-alumni-grid">
          {returning.map((player) => (
            <a
              href={pathForPlayer(player.slug)}
              key={player.slug}
              onClick={(event) => {
                event.preventDefault()
                onSelectPlayer(player.slug)
              }}
            >
              <span>{player.name}</span>
              <strong>
                {player.current
                  ? `#${player.current.rank} · ${player.current.score}`
                  : 'No current score'}
              </strong>
              <small>
                {player.finishes
                  .map(
                    (finish) =>
                      `${finish.seasonYear} ${formatMoneyPlace(finish.place)} (${finish.score})`,
                  )
                  .join(' · ')}
              </small>
            </a>
          ))}
        </div>
      </section>

      {selectedSeason && (
        <section className="history-section">
          <div className="history-section-heading history-section-controls">
            <div>
              <p className="eyebrow">Final table</p>
              <h2>{selectedSeason.seasonYear} standings</h2>
            </div>
            <span>
              {selectedSeason.standings.length} entries · money line{' '}
              {finalMoneyLine(selectedSeason) ?? '—'}
            </span>
          </div>
          <div className="history-table-scroll">
            <table className="history-final-table">
              <thead>
                <tr>
                  <th scope="col">Place</th>
                  <th scope="col">Player</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {selectedSeason.standings.map((standing) => {
                  const slug = playerSlug(standing.name)
                  const linked = currentRosterSlugs.has(slug)
                  return (
                    <tr
                      className={standing.rank <= 3 ? 'money' : undefined}
                      key={standing.entryId}
                    >
                      <td>{formatMoneyPlace(standing.rank)}</td>
                      <th scope="row">
                        {linked ? (
                          <a
                            href={pathForPlayer(slug)}
                            onClick={(event) => {
                              event.preventDefault()
                              onSelectPlayer(slug)
                            }}
                          >
                            {standing.name}
                          </a>
                        ) : (
                          standing.name
                        )}
                      </th>
                      <td>{standing.seasonScore}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
