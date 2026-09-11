import { useEffect, useMemo, useState } from 'react'
import {
  buildCurrentPlayerProfile,
  completedForecastWeekCount,
  EVIDENCE_LABELS,
  EVIDENCE_RULES,
  frozenPlayerWeek,
  leanLabel,
  PREDICTION_STRATEGY_ID,
  predictPlayerWeek,
  predictionMaturity,
  PREDICTION_MATURITY_MILESTONES,
  residualLabel,
  residualSliceCopy,
  summarizePlayerPredictionResiduals,
  type PredictedGame,
  type PredictionForecasts,
  type PredictionMaturity,
  type PredictionResidualReport,
  type ResidualCell,
  type ResidualGroup,
} from './playerPrediction'
import {
  summarizePlayerTeamBias,
  TEAM_BIAS_WARMTH_LABELS,
  teamBiasSentence,
  type TeamBiasSignal,
} from './playerTeamBias'
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
  PLAYER_HOOK_KEYS,
  PLAYER_HOOK_LABELS,
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
import type { TeamRosterFile } from './teamRoster'

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
  const confidence = game.confidence ?? 'low'
  return (
    <div className={`prediction-meter ${confidence}`}>
      <div className="prediction-meter-head">
        <strong title="How far this habit sits from a coin flip, after shrinking small samples.">
          {meter}
        </strong>
        <span className="prediction-lean">{leanLabel(meter)}</span>
        <span
          className={`prediction-evidence ${confidence}`}
          title={EVIDENCE_RULES[confidence]}
        >
          {EVIDENCE_LABELS[confidence]}
        </span>
      </div>
      <div
        className="prediction-meter-track"
        role="meter"
        aria-label="Lean strength"
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

function ResidualMetric({
  cell,
  group,
}: {
  cell: ResidualCell
  group: ResidualGroup
}) {
  const copy = residualSliceCopy(group, cell)
  return (
    <div className="residual-card" title={copy.title}>
      <span>{residualLabel(group, cell.key)}</span>
      <strong>{formatAccuracy(cell.accuracy)}</strong>
      <small>{copy.line}</small>
    </div>
  )
}

function ResidualGroupBlock({
  title,
  hint,
  group,
  cells,
}: {
  title: string
  hint: string
  group: ResidualGroup
  cells: ResidualCell[]
}) {
  if (cells.length === 0) return null
  return (
    <div className="residual-group">
      <h3>
        {title}
        <span>{hint}</span>
      </h3>
      <div className="residual-grid">
        {cells.map((cell) => (
          <ResidualMetric key={`${group}-${cell.key}`} cell={cell} group={group} />
        ))}
      </div>
    </div>
  )
}

const RESIDUAL_TABS: Array<{
  key: ResidualGroup
  tab: string
  title: string
  hint: string
}> = [
  {
    key: 'overall',
    tab: 'Overview',
    title: 'Everything together',
    hint: 'Every locked player-game in this view, not unique matchups',
  },
  {
    key: 'league',
    tab: 'League',
    title: 'By league',
    hint: 'Counts are player-games, not unique matchups',
  },
  {
    key: 'market',
    tab: 'Guessed side',
    title: 'By the side we guessed',
    hint: 'Whether our locked guess named the favorite or the underdog',
  },
  {
    key: 'habit',
    tab: 'Habit',
    title: 'By the habit behind the guess',
    hint: 'Only the guesses that one tendency drove',
  },
  {
    key: 'confidence',
    tab: 'Evidence',
    title: 'By how much evidence backed it',
    hint: 'Same sample-depth labels shown on each player’s card',
  },
]

function residualCells(
  report: PredictionResidualReport,
  group: ResidualGroup,
) {
  if (group === 'overall') return [report.overall]
  if (group === 'league') return report.byLeague
  if (group === 'market') return report.byMarket
  if (group === 'habit') return report.byHabit
  return report.byConfidence
}

function ResidualTabs({
  report,
  label,
}: {
  report: PredictionResidualReport
  label: string
}) {
  const [selected, setSelected] = useState<ResidualGroup>('overall')
  const active = RESIDUAL_TABS.find((tab) => tab.key === selected)!

  return (
    <div className="residual-tabs">
      <div className="residual-tab-list" role="tablist" aria-label={label}>
        {RESIDUAL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected === tab.key}
            className={selected === tab.key ? 'active' : undefined}
            onClick={() => setSelected(tab.key)}
          >
            {tab.tab}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <ResidualGroupBlock
          title={active.title}
          hint={active.hint}
          group={active.key}
          cells={residualCells(report, active.key)}
        />
      </div>
    </div>
  )
}

function PredictionMaturityGuide({
  maturity,
}: {
  maturity: PredictionMaturity
}) {
  const stageIndex = PREDICTION_MATURITY_MILESTONES.findIndex(
    (stage) => stage.key === maturity.key,
  )
  const weeks = `${maturity.completedWeeks} completed forecast ${
    maturity.completedWeeks === 1 ? 'week' : 'weeks'
  }`
  const calls = `${maturity.gradedCalls} graded ${
    maturity.gradedCalls === 1 ? 'call' : 'calls'
  }`

  return (
    <div className={`prediction-maturity ${maturity.key}`}>
      <div className="prediction-maturity-copy">
        <span>Data maturity</span>
        <strong>{maturity.label}</strong>
        <p>{maturity.detail}</p>
        <small>
          {weeks} · {calls}. A partial week adds graded calls but does not count
          as completed.
        </small>
      </div>
      <details>
        <summary>How the maturity stages advance</summary>
        <ol aria-label="Prediction data maturity milestones">
          {PREDICTION_MATURITY_MILESTONES.map((stage, index) => (
            <li
              key={stage.key}
              className={
                index === stageIndex
                  ? 'current'
                  : index < stageIndex
                    ? 'reached'
                    : undefined
              }
            >
              <span>{stage.label}</span>
              <small>
                {stage.weeks === 0
                  ? 'Starting point'
                  : `${stage.weeks}+ weeks · ${stage.calls}+ calls`}
              </small>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}

function ResidualReport({
  report,
  maturity,
}: {
  report: PredictionResidualReport
  maturity: PredictionMaturity
}) {
  const updated = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(report.updatedAt))

  return (
    <section
      className="residual-report"
      aria-label="Prediction model scorecard"
    >
      <div className="residual-heading">
        <p className="eyebrow">Prediction model scorecard</p>
        <h2>How often we guess each player&apos;s pick</h2>
        <p>
          Before each slate, the model guesses which side every player will
          take, using only their earlier graded weeks. Those guesses lock at
          the week&apos;s first kickoff, so later rule changes cannot rewrite
          them. Once results land, each locked guess is compared with the pick
          the player actually made — this scores whether we read the person
          right, not whether their pick won.
        </p>
        <p className="residual-reading">
          In every tile the big number is how often we named the side they
          actually picked, among player-games that are already graded. A
          player-game is one person on one slate game, so a graded count is
          not a count of unique matchups. Under the percentage is that graded
          hit count, how many calls we made in the slice, and how often we
          declined to guess. Hover a tile for the sentence-form reading. The
          maturity label above is for the whole pool; it is not a claim that
          any one slice already has a deep sample.
        </p>
        <p className="residual-meta">
          Strategy {report.strategyId} · updated {updated}
        </p>
      </div>

      <PredictionMaturityGuide maturity={maturity} />

      <ResidualTabs report={report} label="Pool-wide scorecard breakdown" />
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

function TeamBiasCard({
  signal,
  teamName,
  currentSeason,
  career,
}: {
  signal: TeamBiasSignal
  teamName: string
  currentSeason: number
  career: boolean
}) {
  const directionalPicks =
    signal.direction === 'take'
      ? signal.takes
      : signal.appearances - signal.takes
  const seasonDirectionalPicks =
    signal.direction === 'take'
      ? signal.seasonTakes
      : signal.seasonAppearances - signal.seasonTakes
  const action = signal.direction === 'take' ? 'Took' : 'Faded'
  const careerDetail = `${action} ${directionalPicks} of ${signal.appearances}`
  const seasonDetail = `${currentSeason}: ${seasonDirectionalPicks} of ${signal.seasonAppearances}`

  return (
    <li className={`team-bias-card ${signal.warmth}`}>
      <div className="team-bias-head">
        <span>{TEAM_BIAS_WARMTH_LABELS[signal.warmth]}</span>
        <strong>{Math.round(signal.rate * 100)}%</strong>
      </div>
      <h4>{teamName}</h4>
      <p>{teamBiasSentence(signal, teamName)}</p>
      <small>
        {career
          ? `${careerDetail} career · ${seasonDetail}`
          : `${careerDetail} this season`}
      </small>
    </li>
  )
}


export default function PlayersView({
  slate,
  history,
  careerHistory = history,
  recommendations,
  forecasts,
  teamRoster,
  selectedSlug,
  onSelectPlayer,
}: {
  slate: Slate
  history: PlayerHistory
  careerHistory?: PlayerHistory
  recommendations: RecommendationHistory
  forecasts: PredictionForecasts | null
  teamRoster: TeamRosterFile
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
  const teamBias = selectedPlayer
    ? summarizePlayerTeamBias(
        selectedPlayer.entryId,
        careerHistory,
        history.pool.seasonYear,
      )
    : null
  const teamNameByKey = useMemo(
    () =>
      new Map(
        teamRoster.teams.map((team) => [
          `${team.sport}:${team.abbrev}`,
          team.name === team.abbrev
            ? team.abbrev
            : `${team.name} (${team.abbrev})`,
        ]),
      ),
    [teamRoster.teams],
  )
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
  const playerResiduals = selectedPlayer
    ? summarizePlayerPredictionResiduals(
        forecasts,
        selectedPlayer.entryId,
        history.pool.seasonYear,
      )
    : null
  const scoredWeeks = history.weeks.filter(weekIsGraded).length
  const maturity = forecasts?.residuals
    ? predictionMaturity(
        completedForecastWeekCount(
          forecasts.weeks,
          history.weeks,
          history.pool.seasonYear,
        ),
        forecasts.residuals.overall.graded,
      )
    : null
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

      {forecasts?.residuals && maturity && (
        <ResidualReport report={forecasts.residuals} maturity={maturity} />
      )}

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

              {teamBias &&
                (teamBias.takes.length > 0 || teamBias.fades.length > 0) && (
                  <section
                    className="player-team-bias"
                    aria-label="Team loyalty watch"
                  >
                    <div className="player-team-bias-heading">
                      <div>
                        <p className="eyebrow">Team loyalty watch</p>
                        <h3>Teams they take or fade</h3>
                      </div>
                      <small>
                        Early reads appear after 2 opportunities. Wording warms
                        as the rate persists across more appearances.
                      </small>
                    </div>
                    <div className="team-bias-groups">
                      {teamBias.takes.length > 0 && (
                        <div>
                          <h4>Teams they take</h4>
                          <ul>
                            {teamBias.takes.map((signal) => (
                              <TeamBiasCard
                                key={signal.key}
                                signal={signal}
                                teamName={
                                  teamNameByKey.get(signal.key) ?? signal.abbrev
                                }
                                currentSeason={history.pool.seasonYear}
                                career={teamBias.seasons.length > 1}
                              />
                            ))}
                          </ul>
                        </div>
                      )}
                      {teamBias.fades.length > 0 && (
                        <div>
                          <h4>Teams they fade</h4>
                          <ul>
                            {teamBias.fades.map((signal) => (
                              <TeamBiasCard
                                key={signal.key}
                                signal={signal}
                                teamName={
                                  teamNameByKey.get(signal.key) ?? signal.abbrev
                                }
                                currentSeason={history.pool.seasonYear}
                                career={teamBias.seasons.length > 1}
                              />
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )}

              <div className="player-tier-block">
                <h3 className="player-tier-heading">
                  Pick % on the Favorable Hook Side
                </h3>
                <p className="player-tier-explainer">
                  Uses the locked CBS spread. The favorable side gets the
                  better side of 3 or 7: a favorite below the key number or an
                  underdog above it. This profiles the player&apos;s choice,
                  not whether that pick won.
                </p>
                <div
                  className="tendency-grid player-hook-summary"
                  aria-label="Pick percentage on favorable field-goal and touchdown hook sides"
                >
                  {PLAYER_HOOK_KEYS.map((key) => {
                    const stats = summary.hooks[key]
                    return (
                      <Metric
                        key={key}
                        label={`${PLAYER_HOOK_LABELS[key]} · ${
                          key === 'fg' ? '2.5 / 3.5' : '6.5 / 7.5'
                        }`}
                        value={stats.rate}
                        detail={stats.detail}
                      />
                    )
                  })}
                </div>
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
                    <div className="prediction-score-pair">
                      <div className="week-score">
                        <span>This card</span>
                        <strong>
                          {formatAccuracy(prediction?.accuracy ?? null)}
                        </strong>
                        <small>
                          {prediction?.correct ?? 0} of {prediction?.graded ?? 0}{' '}
                          graded player-games · {prediction?.calls ?? 0} calls
                        </small>
                      </div>
                      <div
                        className="week-score season-read"
                        title={
                          playerResiduals
                            ? residualSliceCopy(
                                'overall',
                                playerResiduals.overall,
                              ).title
                            : undefined
                        }
                      >
                        <span>Season model read</span>
                        <strong>
                          {formatAccuracy(
                            playerResiduals?.overall.accuracy ?? null,
                          )}
                        </strong>
                        <small>
                          {playerResiduals
                            ? residualSliceCopy(
                                'overall',
                                playerResiduals.overall,
                              ).line
                            : 'No locked guesses yet'}
                        </small>
                      </div>
                    </div>
                  </div>

                  {playerResiduals && playerResiduals.overall.calls > 0 && (
                    <details className="player-residual-breakdown">
                      <summary>Break down this player&apos;s season model read</summary>
                      <p>
                        Same measurement as the pool scorecard, filtered to
                        this player. Counts are this person&apos;s player-games.
                        It grades whether we named their side, not whether that
                        side won.
                      </p>
                      <ResidualTabs
                        report={playerResiduals}
                        label="Player prediction hit-rate breakdown"
                      />
                    </details>
                  )}

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
                      <p className="prediction-legend">
                        The number is lean strength: how far the habit sits
                        from a coin flip once small samples are shrunk. The
                        chip beside it is how much evidence stands behind
                        that lean, so a tall bar on a short history reads
                        strong lean · thin sample.
                      </p>
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
