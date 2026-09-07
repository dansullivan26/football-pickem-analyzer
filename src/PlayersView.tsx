import { useEffect, useMemo, useState } from 'react'
import {
  buildCurrentPlayerProfile,
  frozenPlayerWeek,
  PREDICTION_STRATEGY_ID,
  predictPlayerWeek,
  predictionSeasonRecord,
  type PredictedGame,
  type PredictionForecasts,
  type PredictionResidualReport,
  type ResidualCell,
} from './playerPrediction'
import { careerSeasonYears, weekIsGraded, weeksForSeason } from './careerHistory'
import { finalEventIds, formatWinningScore, mergeEventScores } from './gameStatus'
import {
  formatSpread,
  pickResultLabel,
  pickResultState,
  pickSelectionLabel,
} from './pickLabels'
import {
  playerRankingWeeks,
  playerSlugByEntryId,
  rankPlayersByWins,
  type PlayerRankingScope,
} from './playerDirectory'
import lastKickoffData from './data/last-kickoff.json'
import { pathForPlayer } from './routes'
import type { LastKickoffFile } from './lastKickoff'
import {
  PLAYER_TIER_KEYS,
  PLAYER_TIER_LABELS,
  summarizePlayer,
} from './playerTendencies'
import {
  REST_SPLIT_KEYS,
  REST_SPLIT_LABELS,
  TRAVEL_SPLIT_KEYS,
  TRAVEL_SPLIT_LABELS,
  buildTravelRestIndex,
} from './travelRest'
import type { PlayerHistory, RecommendationHistory, Slate } from './types'

function predictedPickLabel(game: PredictedGame) {
  if (!game.predictedSide || !game.predictedTeam) return 'No call'
  const spread =
    game.predictedSide === 'home' ? game.homeSpread : game.homeSpread * -1
  return `${game.predictedTeam} ${formatSpread(spread)}`
}

function formatAccuracy(value: number | null) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function PredictionMeter({ game }: { game: PredictedGame }) {
  const meter = game.meter ?? null
  const why = game.meterWhy || game.reason
  if (meter == null) {
    return (
      <div className="prediction-meter no-call">
        <div className="prediction-meter-head">
          <span>No call</span>
        </div>
        <small>{why}</small>
      </div>
    )
  }
  return (
    <div className={`prediction-meter ${game.confidence ?? 'low'}`}>
      <div className="prediction-meter-head">
        <strong>{meter}</strong>
        <span>{game.confidence} confidence</span>
      </div>
      <div
        className="prediction-meter-track"
        role="meter"
        aria-label="Prediction confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meter}
      >
        <span style={{ width: `${meter}%` }} />
      </div>
      <small>{why}</small>
    </div>
  )
}

function ResidualMetric({ cell }: { cell: ResidualCell }) {
  return (
    <div className="residual-card">
      <span>{cell.key}</span>
      <strong>{formatAccuracy(cell.accuracy)}</strong>
      <small>
        {cell.correct}/{cell.graded} graded · {Math.round((cell.noCallRate ?? 0) * 100)}%
        no-call
      </small>
    </div>
  )
}

function ResidualReport({ report }: { report: PredictionResidualReport }) {
  return (
    <section className="residual-report" aria-label="Prediction residuals">
      <div className="residual-heading">
        <p className="eyebrow">Frozen {report.strategyId} residuals</p>
        <p>
          Pool-wide hit rate on locked forecasts, split so later reviews can
          see which slider to add next.
        </p>
      </div>
      <div className="residual-grid">
        <ResidualMetric cell={{ ...report.overall, key: 'Overall' }} />
        {report.byLeague.map((cell) => (
          <ResidualMetric key={cell.key} cell={cell} />
        ))}
        {report.byMarket.map((cell) => (
          <ResidualMetric key={cell.key} cell={cell} />
        ))}
        {report.byHabit.map((cell) => (
          <ResidualMetric key={cell.key} cell={cell} />
        ))}
        {report.byConfidence.map((cell) => (
          <ResidualMetric key={`conf-${cell.key}`} cell={cell} />
        ))}
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="tendency-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}


export default function PlayersView({
  slate,
  history,
  careerHistory = history,
  recommendations,
  forecasts,
  selectedSlug,
  onSelectPlayer,
}: {
  slate: Slate
  history: PlayerHistory
  careerHistory?: PlayerHistory
  recommendations: RecommendationHistory
  forecasts: PredictionForecasts | null
  selectedSlug: string | null
  onSelectPlayer: (slug: string) => void
}) {
  const [query, setQuery] = useState('')
  const [namesHidden, setNamesHidden] = useState(() => {
    try {
      return sessionStorage.getItem('hidePlayerNames') === '1'
    } catch {
      return false
    }
  })
  const slugsByEntryId = useMemo(
    () => playerSlugByEntryId(history.entries),
    [history.entries],
  )
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(
    slate.week.order,
  )
  const [rankingScope, setRankingScope] = useState<PlayerRankingScope>(
    slate.week.order,
  )
  const [detailView, setDetailView] = useState<'prediction' | 'actual'>(
    'prediction',
  )
  const scoresByEvent = useMemo(
    () =>
      mergeEventScores([
        recommendations.weeks.flatMap((week) => week.games),
        slate.games,
      ]),
    [recommendations.weeks, slate.games],
  )
  const finalEvents = useMemo(() => finalEventIds(slate.games), [slate.games])

  const availableWeeks = useMemo(() => {
    const weeks = new Map<
      number,
      { week: number; label: string; scored: boolean; graded: boolean }
    >()
    for (const week of history.weeks) {
      weeks.set(week.week, {
        week: week.week,
        label: week.label,
        scored: week.scored,
        graded: weekIsGraded(week),
      })
    }
    for (const week of weeksForSeason(
      recommendations.weeks,
      history.pool.seasonYear,
    )) {
      const historyWeek = weeks.get(week.week)
      weeks.set(week.week, {
        week: week.week,
        label: week.label,
        scored: historyWeek?.scored ?? week.scored,
        graded: historyWeek?.graded ?? week.scored,
      })
    }
    return [...weeks.values()].sort((a, b) => a.week - b.week)
  }, [
    history.pool.seasonYear,
    history.weeks,
    recommendations.weeks,
  ])
  const rankingWeeks = useMemo(
    () =>
      playerRankingWeeks(
        careerHistory.weeks,
        rankingScope,
        history.pool.seasonYear,
      ),
    [
      careerHistory.weeks,
      history.pool.seasonYear,
      rankingScope,
    ],
  )
  const filteredPlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const ranked = rankPlayersByWins(history.entries, rankingWeeks)
    if (!normalized) return ranked
    return ranked.filter(({ entry }) =>
      entry.name.toLowerCase().includes(normalized),
    )
  }, [history.entries, query, rankingWeeks])

  const selectedPlayer = selectedSlug
    ? (history.entries.find(
        (entry) => slugsByEntryId.get(entry.entryId) === selectedSlug,
      ) ?? null)
    : (filteredPlayers[0]?.entry ?? null)

  useEffect(() => {
    const previous = document.title
    document.title = selectedPlayer
      ? `${namesHidden ? 'Player' : selectedPlayer.name} · Pick'em Edge`
      : selectedSlug
        ? 'Player not found · Pick\'em Edge'
        : 'Players · Pick\'em Edge'
    return () => {
      document.title = previous
    }
  }, [namesHidden, selectedPlayer, selectedSlug])
  const selectedWeek =
    availableWeeks.find((week) => week.week === selectedWeekNumber) ??
    availableWeeks.at(-1)
  const selectedHistoryWeek = history.weeks.find(
    (week) => week.week === selectedWeek?.week,
  )
  const recommendationWeek = weeksForSeason(
    recommendations.weeks,
    history.pool.seasonYear,
  ).find((week) => week.week === selectedWeek?.week)
  const weekEntry = selectedHistoryWeek?.entries.find(
    (entry) => entry.entryId === selectedPlayer?.entryId,
  )
  const travelRestByAppearance = useMemo(
    () =>
      buildTravelRestIndex(
        slate,
        recommendations,
        lastKickoffData as LastKickoffFile,
      ).byAppearance,
    [slate, recommendations],
  )
  const summary = selectedPlayer
    ? summarizePlayer(
        selectedPlayer.entryId,
        careerHistory.weeks,
        recommendations.weeks,
        careerHistory.pool.seasonYear,
        travelRestByAppearance,
      )
    : null
  const currentProfile = selectedPlayer
    ? buildCurrentPlayerProfile(
        selectedPlayer.entryId,
        careerHistory,
        recommendations,
        travelRestByAppearance,
      )
    : null
  const livePrediction =
    selectedPlayer && recommendationWeek
      ? predictPlayerWeek(
          selectedPlayer.entryId,
          recommendationWeek,
          careerHistory,
          recommendations,
          travelRestByAppearance,
        )
      : null
  const frozenWeek = forecasts?.weeks.find(
    (week) =>
      week.week === selectedWeek?.week &&
      week.strategyId === PREDICTION_STRATEGY_ID,
  )
  const frozen = selectedPlayer
    ? frozenPlayerWeek(
        forecasts,
        selectedPlayer.entryId,
        selectedWeek?.week ?? 0,
      )
    : null
  const gradedFrozen = frozen?.games.filter((game) => game.correct != null) ?? []
  const prediction =
    livePrediction && frozenWeek?.frozenAt && frozen
      ? {
          ...livePrediction,
          trainingThroughWeek: frozenWeek.trainingThroughWeek,
          profile: {
            ...livePrediction.profile,
            archetype: frozen.archetype,
            archetypeDetail: frozen.archetypeDetail,
            picks: frozen.priorPicks,
          },
          games: frozen.games,
          calls: frozen.calls,
          graded: gradedFrozen.length,
          correct: gradedFrozen.filter((game) => game.correct).length,
          accuracy: gradedFrozen.length
            ? gradedFrozen.filter((game) => game.correct).length /
              gradedFrozen.length
            : null,
        }
      : livePrediction
  const predictionRecord = selectedPlayer
    ? predictionSeasonRecord(
        selectedPlayer.entryId,
        history,
        recommendations,
        forecasts,
        travelRestByAppearance,
      )
    : null
  const scoredWeeks = history.weeks.filter(weekIsGraded).length
  const habitYears = careerSeasonYears(careerHistory)
  const habitSeasonLabel =
    habitYears.length > 1
      ? `${habitYears[0]}–${habitYears[habitYears.length - 1]} career`
      : `${habitYears[0] ?? history.pool.seasonYear} season`
  const rankingLabel =
    rankingScope === 'season'
      ? 'Season'
      : (availableWeeks.find((week) => week.week === rankingScope)?.label ??
        `Week ${rankingScope}`)

  return (
    <main>
      <section className="hero players-hero">
        <div>
          <p className="eyebrow">Player history</p>
          <h1>Pool tendencies</h1>
          <p className="hero-copy">
            Track every weekly card, then compare how each player approaches
            favorites, underdogs, home teams (neutral sites excluded), our
            line-value side, and the weekly tiebreaker. Line-value follow rates also split by the
            kickoff-frozen lock, hammer, lean, slight, and neutral tier.
            Pick rates on traveling and rested teams use the same
            time-zone hops and card-or-schedule rest as Lines.
            Habit labels use every archived season for the same CBS entry.
          </p>
        </div>
        <div className="hero-aside">
          <div className="week-chip">
            <span>History loaded</span>
            <strong>{history.entries.length} players</strong>
            <small>
              {scoredWeeks} scored {scoredWeeks === 1 ? 'week' : 'weeks'}
            </small>
          </div>
          <button
            className="names-toggle"
            type="button"
            aria-pressed={namesHidden}
            onClick={() => {
              setNamesHidden((current) => {
                const next = !current
                try {
                  sessionStorage.setItem('hidePlayerNames', next ? '1' : '0')
                } catch {
                  // Private mode can block sessionStorage.
                }
                return next
              })
            }}
          >
            {namesHidden ? 'Show names' : 'Hide names'}
          </button>
        </div>
      </section>

      {scoredWeeks === 0 && (
        <div className="notice">
          Week 1 is ready for Tuesday&apos;s scored export. Tendencies will
          populate automatically once picks and results are available.
        </div>
      )}

      {forecasts?.residuals && <ResidualReport report={forecasts.residuals} />}

      <section
        className={`players-layout${namesHidden ? ' names-hidden' : ''}`}
      >
        {!namesHidden && (
        <aside className="player-directory" aria-label="Pool players">
          <div className="directory-heading">
            <div>
              <p className="eyebrow">{rankingLabel} rankings</p>
              <h2>Players</h2>
            </div>
            <span>{filteredPlayers.length}</span>
          </div>
          <label className="player-ranking-filter">
            <span>Rank by</span>
            <select
              value={rankingScope}
              onChange={(event) => {
                const next =
                  event.target.value === 'season'
                    ? 'season'
                    : Number(event.target.value)
                setRankingScope(next)
                if (next !== 'season') setSelectedWeekNumber(next)
              }}
            >
              <option value="season">Season</option>
              {availableWeeks.map((week) => (
                <option key={week.week} value={week.week}>
                  {week.label}
                  {week.week === slate.week.order ? ' (Current)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="search player-search">
            <span className="sr-only">Search players</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search players"
            />
          </label>
          <div className="player-list">
            {filteredPlayers.map(({ entry, rank, record }) => {
              const slug = slugsByEntryId.get(entry.entryId)
              if (!slug) return null
              return (
              <a
                className={
                  entry.entryId === selectedPlayer?.entryId ? 'active' : ''
                }
                key={entry.entryId}
                href={pathForPlayer(slug)}
                onClick={(event) => {
                  event.preventDefault()
                  onSelectPlayer(slug)
                }}
              >
                <span>
                  <span className="player-rank-number">#{rank}</span>
                  {entry.name}
                  <span
                    className="player-win-count"
                    title={`${record.wins} correct picks`}
                  >
                    {record.wins}W
                  </span>
                </span>
                <small>
                  {record.scored
                    ? `${record.wins} of ${record.scored} graded picks`
                    : `No graded picks in ${rankingLabel.toLowerCase()}`}
                </small>
              </a>
              )
            })}
          </div>
        </aside>
        )}

        <section className="player-detail">
          {selectedPlayer && summary ? (
            <>
              <div className="player-detail-heading">
                <div>
                  <p className="eyebrow">Player profile</p>
                  <h2>{namesHidden ? 'Player' : selectedPlayer.name}</h2>
                  {currentProfile && (
                    <div className="player-archetype">
                      <strong>{currentProfile.archetype}</strong>
                      {currentProfile.signals.length === 0 && (
                        <span>{currentProfile.archetypeDetail}</span>
                      )}
                    </div>
                  )}
                  {currentProfile && currentProfile.signals.length > 0 && (
                    <ol
                      className="player-signals"
                      aria-label="Active tendencies, strongest first"
                    >
                      {currentProfile.signals.map((signal) => (
                        <li key={signal.key}>
                          <div className="player-signal-head">
                            <strong>{signal.label}</strong>
                            <span>
                              {Math.round(signal.rate * 100)}% · {signal.hits}{' '}
                              of {signal.eligible}
                            </span>
                            {signal.thin && (
                              <em title="Enough to make a call, not enough to trust yet">
                                thin
                              </em>
                            )}
                          </div>
                          <small>{signal.sentence}</small>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                <label>
                  <span className="sr-only">Select week</span>
                  <select
                    value={selectedWeek?.week}
                    onChange={(event) =>
                      setSelectedWeekNumber(Number(event.target.value))
                    }
                  >
                    {availableWeeks.map((week) => (
                      <option key={week.week} value={week.week}>
                        {week.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="tendency-grid" aria-label="Player tendencies">
                <Metric
                  label="Picks tracked"
                  value={String(summary.made)}
                  detail={`${summary.scored} scored · ${habitSeasonLabel}`}
                />
                <Metric
                  label="Favorites"
                  value={summary.favoriteRate}
                  detail="Share of recorded picks"
                />
                <Metric
                  label="Home teams"
                  value={summary.homeRate}
                  detail="CBS home side · neutrals excluded"
                />
                <Metric
                  label="Win rate"
                  value={summary.winRate}
                  detail="Pushes excluded"
                />
                <Metric
                  label="Line-value side"
                  value={summary.lineValueRate}
                  detail={summary.lineValueDetail}
                />
                <Metric
                  label="Tiebreaker ±2"
                  value={summary.tiebreakerRate}
                  detail={summary.tiebreakerDetail}
                />
              </div>

              <div className="player-tier-block">
                <h3 className="player-tier-heading">Pick % by Line Value Tiers</h3>
                <div
                  className="summary-grid player-tier-summary"
                  aria-label="Pick % by Line Value Tiers"
                >
                  {PLAYER_TIER_KEYS.map((tier) => {
                    const stats = summary.tiers[tier]
                    return (
                      <div className={`summary-card ${tier}`} key={tier}>
                        <span>{PLAYER_TIER_LABELS[tier]}</span>
                        <strong>{stats.rate}</strong>
                        <small>{stats.detail}</small>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="player-tier-block">
                <h3 className="player-tier-heading">Pick % by Travel</h3>
                <div
                  className="tendency-grid"
                  aria-label="Pick % on traveling teams"
                >
                  {TRAVEL_SPLIT_KEYS.map((key) => {
                    const stats = summary.travel[key]
                    return (
                      <Metric
                        key={key}
                        label={TRAVEL_SPLIT_LABELS[key]}
                        value={stats.rate}
                        detail={stats.detail}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="player-tier-block">
                <h3 className="player-tier-heading">Pick % by Rest</h3>
                <div
                  className="tendency-grid"
                  aria-label="Pick % on rested teams"
                >
                  {REST_SPLIT_KEYS.map((key) => {
                    const stats = summary.rest[key]
                    return (
                      <Metric
                        key={key}
                        label={REST_SPLIT_LABELS[key]}
                        value={stats.rate}
                        detail={stats.detail}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="player-view-toggle" aria-label="Player week view">
                <button
                  className={detailView === 'prediction' ? 'active' : ''}
                  type="button"
                  onClick={() => setDetailView('prediction')}
                >
                  Prediction
                </button>
                <button
                  className={detailView === 'actual' ? 'active' : ''}
                  type="button"
                  onClick={() => setDetailView('actual')}
                >
                  Actual picks
                </button>
              </div>

              {detailView === 'prediction' ? (
                <div className="week-card prediction-card">
                  <div className="week-card-heading">
                    <div>
                      <span>{selectedWeek?.label}</span>
                      <strong>
                        {selectedWeek?.graded
                          ? 'Prediction report'
                          : 'Predicted card'}
                      </strong>
                      <small>
                        {prediction?.trainingThroughWeek
                          ? `${prediction.profile.archetype} · trained through Week ${prediction.trainingThroughWeek}`
                          : 'No earlier graded week to train on'}
                      </small>
                    </div>
                    <div className="week-score">
                      <span>
                        {selectedWeek?.graded ? 'This week' : 'Season accuracy'}
                      </span>
                      <strong>
                        {selectedWeek?.graded
                          ? formatAccuracy(prediction?.accuracy ?? null)
                          : formatAccuracy(predictionRecord?.accuracy ?? null)}
                      </strong>
                      <small>
                        {selectedWeek?.graded
                          ? `${prediction?.correct ?? 0} of ${prediction?.graded ?? 0} graded · ${prediction?.calls ?? 0} calls`
                          : `${predictionRecord?.correct ?? 0} of ${predictionRecord?.calls ?? 0} graded`}
                      </small>
                    </div>
                  </div>

                  {!prediction || prediction.calls === 0 ? (
                    <div className="prediction-empty">
                      <strong>No responsible calls yet</strong>
                      <p>
                        The model waits for at least 20 picks from earlier
                        weeks, or a smaller but decisive line-value, public,
                        travel, or rest sample. A week never trains on
                        itself, so calls start with the next slate.
                      </p>
                    </div>
                  ) : (
                    <div className="prediction-list">
                      {prediction.games.map((game) => {
                        const score = formatWinningScore(
                          scoresByEvent.get(game.cbsEventId) ?? {},
                        )
                        return (
                        <div className="prediction-row" key={game.cbsEventId}>
                          <div className="history-matchup">
                            <span>{game.sport}</span>
                            <strong>
                              {game.away} @ {game.home}
                            </strong>
                            <small>
                              CBS: {game.home} {formatSpread(game.homeSpread)}
                              {score ? ` · ${score}` : ''}
                            </small>
                          </div>
                          <div className="prediction-selection">
                            <span>Prediction</span>
                            <strong>{predictedPickLabel(game)}</strong>
                            <small>{game.reason}</small>
                          </div>
                          <PredictionMeter game={game} />
                          {selectedWeek?.graded && (
                            <div className="prediction-actual">
                              <span>Actual</span>
                              <strong>
                                {game.actualSide === 'home'
                                  ? game.home
                                  : game.actualSide === 'away'
                                    ? game.away
                                    : '—'}
                              </strong>
                              <small
                                className={
                                  game.correct === true
                                    ? 'hit'
                                    : game.correct === false
                                      ? 'miss'
                                      : ''
                                }
                              >
                                {game.correct === true
                                  ? 'Hit'
                                  : game.correct === false
                                    ? 'Miss'
                                    : 'Not graded'}
                              </small>
                            </div>
                          )}
                        </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="week-card">
                  <div className="week-card-heading">
                    <div>
                      <span>{selectedWeek?.label}</span>
                      <strong>
                        {selectedWeek?.scored
                          ? 'Final picks'
                          : selectedWeek?.graded
                            ? 'Picks in progress'
                            : 'Picks not yet public'}
                      </strong>
                    </div>
                    <div className="week-score">
                      <span>Week score</span>
                      <strong>{weekEntry?.weekScore ?? '—'}</strong>
                      {weekEntry?.tiebreaker?.answer != null && (
                        <small>TB {weekEntry.tiebreaker.answer}</small>
                      )}
                    </div>
                  </div>

                  <div className="pick-history-list">
                    {weekEntry?.picks.map((pick) => {
                      const score = formatWinningScore(
                        scoresByEvent.get(pick.cbsEventId) ?? {},
                      )
                      const isFinal = finalEvents.has(pick.cbsEventId)
                      return (
                      <div className="history-pick" key={pick.gameId}>
                        <div className="history-matchup">
                          <span>{pick.sport}</span>
                          <strong>
                            {pick.away} @ {pick.home}
                          </strong>
                          <small>
                            CBS: {pick.home} {formatSpread(pick.homeSpread)}
                          </small>
                        </div>
                        <div className="history-selection">
                          <span>Selection</span>
                          <strong>{pickSelectionLabel(pick)}</strong>
                        </div>
                        <span
                          className={`pick-result ${pickResultState(pick, isFinal)}`}
                        >
                          {pickResultLabel(pick, isFinal)}
                          {score && <small>{score}</small>}
                        </span>
                      </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : selectedSlug ? (
            <div className="empty-state">
              No player matches <code>/{selectedSlug}</code>.
            </div>
          ) : (
            <div className="empty-state">No players match this filter.</div>
          )}
        </section>
      </section>
    </main>
  )
}
