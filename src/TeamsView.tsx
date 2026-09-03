import { useEffect, useMemo, useState } from 'react'
import TeamLogo from './TeamLogo'
import weatherHistoryData from './data/weather-history.json'
import {
  buildTeamDirectory,
  formatRankedTeamName,
  wonOutrightAsDog,
  type TeamAppearance,
  type TeamRecord,
  type TeamSplit,
} from './teamPerformance'
import { buildTeamProfile } from './teamProfile'
import { formatRankStamp, formatRankTrail, teamWasRanked } from './teamRanks'
import { travelRestTitle } from './travelRest'
import { formatWeatherBucket, type WeatherHistoryFile } from './weatherBuckets'
import BadBeatMenu from './BadBeatMenu'
import { badBeatAnchorId, type BadBeat } from './badBeats'
import { formatWinningScore } from './gameStatus'
import { badBeatSideMark, ourPoolPickOnSide } from './ourEntry'
import { pathForBadBeat, pathForTeam, pathForView, TEAM_PROFILE_HASH } from './routes'
import InjuryLink from './InjuryLink'
import type { PlayerHistory, RecommendationHistory, Slate } from './types'

function formatSpread(value: number) {
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? String(Math.abs(value))
    : Math.abs(value).toFixed(1)
  return value > 0 ? `+${points}` : `-${points}`
}

function formatGameDate(kickoff: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
    .format(new Date(kickoff))
    .replace(',', '')
}

function teamLine(row: TeamAppearance) {
  const number = row.venue === 'home' ? row.homeSpread : row.homeSpread * -1
  return formatSpread(number)
}

function resultLabel(result: TeamAppearance['result']) {
  if (result === 'win') return 'ATS win'
  if (result === 'loss') return 'ATS loss'
  if (result === 'push') return 'Push'
  return 'Awaiting result'
}

function Metric({
  label,
  split,
  hint,
}: {
  label: string
  split: TeamSplit
  hint?: string
}) {
  return (
    <div className="tendency-card" title={hint}>
      <span>{label}</span>
      {hint && <em className="metric-hint">{hint}</em>}
      <strong>{split.rate}</strong>
      <small>
        {split.games} game{split.games === 1 ? '' : 's'} · {split.detail}
      </small>
    </div>
  )
}

function compareTeams(
  left: TeamRecord,
  right: TeamRecord,
  sort: 'name' | 'ats',
) {
  if (sort === 'ats') {
    const leftDecided = left.overall.wins + left.overall.losses
    const rightDecided = right.overall.wins + right.overall.losses
    const leftRate = leftDecided ? left.overall.wins / leftDecided : -1
    const rightRate = rightDecided ? right.overall.wins / rightDecided : -1
    if (rightRate !== leftRate) return rightRate - leftRate
    if (rightDecided !== leftDecided) return rightDecided - leftDecided
  }
  return left.name.localeCompare(right.name)
}

export default function TeamsView({
  slate,
  playerHistory,
  recommendations,
  selectedSlug,
  onSelectTeam,
  seasonBeats,
  onMarkBadBeat,
  onClearBadBeat,
  onOpenBadBeats,
}: {
  slate: Slate
  playerHistory: PlayerHistory
  recommendations: RecommendationHistory
  selectedSlug: string | null
  onSelectTeam: (slug: string | null) => void
  seasonBeats: BadBeat[]
  onMarkBadBeat: (beat: Omit<BadBeat, 'markedAt'>) => void
  onClearBadBeat: (beat: BadBeat) => void
  onOpenBadBeats: (hash?: string) => void
}) {
  const directory = useMemo(
    () =>
      buildTeamDirectory(
        slate,
        recommendations,
        weatherHistoryData as WeatherHistoryFile,
      ),
    [slate, recommendations],
  )
  const [query, setQuery] = useState('')
  const [league, setLeague] = useState<'all' | 'NCAAF' | 'NFL'>('all')
  const [sort, setSort] = useState<'name' | 'ats'>('name')

  const visibleTeams = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return directory.teams
      .filter((team) => {
        const matchesLeague = league === 'all' || team.sport === league
        const matchesQuery =
          !normalized ||
          team.name.toLowerCase().includes(normalized) ||
          team.abbrev.toLowerCase().includes(normalized) ||
          (team.conference ?? '').toLowerCase().includes(normalized)
        return matchesLeague && matchesQuery
      })
      .sort((left, right) => compareTeams(left, right, sort))
  }, [directory.teams, league, query, sort])

  const selected = selectedSlug
    ? (directory.teams.find((team) => team.slug === selectedSlug) ?? null)
    : (visibleTeams[0] ?? null)
  const selectedProfile = selected ? buildTeamProfile(selected) : null
  const appearanceRanks = selected
    ? selected.appearances.map((row) => row.rank)
    : []
  const rankTrail = selected ? formatRankTrail(appearanceRanks) : null
  const showUnranked = teamWasRanked(appearanceRanks)

  useEffect(() => {
    const previous = document.title
    document.title = selected
      ? `${selected.name} · Pick'em Edge`
      : selectedSlug
        ? 'Team not found · Pick\'em Edge'
        : 'Teams · Pick\'em Edge'
    return () => {
      document.title = previous
    }
  }, [selected, selectedSlug])

  useEffect(() => {
    if (!selectedSlug) return
    document
      .getElementById(TEAM_PROFILE_HASH)
      ?.scrollIntoView({ block: 'start' })
  }, [selectedSlug])

  const graded = directory.teams.filter(
    (team) => team.overall.wins + team.overall.losses + team.overall.pushes > 0,
  ).length

  return (
    <main>
      <section className="hero players-hero">
        <div>
          <p className="eyebrow">CBS line tracker</p>
          <h1>Team performance</h1>
          <p className="hero-copy">
            Against the locked pool line, not DraftKings. Performance,
            weather, travel, and rest sit in their own sections. A team
            profile appears after four graded games; weather, travel,
            and rest tiles stay thin until a team has a few such
            kickoffs.
          </p>
        </div>
        <div className="hero-aside">
          <div className="week-chip">
            <span>Teams with a result</span>
            <strong>{graded}</strong>
            <small>
              {directory.teams.length} on the{' '}
              {recommendations.weeks.length === 1 ? 'slate' : 'season'}
            </small>
          </div>
          <a
            className="refresh-button in-page"
            href={pathForView('bad-beats')}
            onClick={(event) => {
              event.preventDefault()
              onOpenBadBeats()
            }}
          >
            Bad beats
            <span>{seasonBeats.length}</span>
          </a>
        </div>
      </section>

      {graded === 0 && (
        <div className="notice">
          Teams are listed from the current slate. ATS tiles stay empty
          until player ingest records a cover.
        </div>
      )}

      <section className="summary-grid teams-summary" aria-label="Pool-wide CBS ATS">
        <div className="summary-card lock">
          <span>Home</span>
          <strong>{directory.home.rate}</strong>
          <small>
            {directory.home.games} game{directory.home.games === 1 ? '' : 's'} ·{' '}
            {directory.home.detail}
          </small>
        </div>
        <div className="summary-card hammer">
          <span>Away</span>
          <strong>{directory.away.rate}</strong>
          <small>
            {directory.away.games} game{directory.away.games === 1 ? '' : 's'} ·{' '}
            {directory.away.detail}
          </small>
        </div>
        <div className="summary-card lean">
          <span>Favorites</span>
          <strong>{directory.favorite.rate}</strong>
          <small>
            {directory.favorite.games} game
            {directory.favorite.games === 1 ? '' : 's'} · {directory.favorite.detail}
          </small>
        </div>
        <div className="summary-card slight">
          <span>Dogs</span>
          <strong>{directory.dog.rate}</strong>
          <small>
            {directory.dog.games} game{directory.dog.games === 1 ? '' : 's'} ·{' '}
            {directory.dog.detail}
          </small>
        </div>
      </section>

      <section className="players-layout">
        <aside className="player-directory" aria-label="Teams">
          <div className="directory-heading">
            <div>
              <p className="eyebrow">Directory</p>
              <h2>Teams</h2>
            </div>
            <span>{visibleTeams.length}</span>
          </div>
          <label className="search player-search">
            <span className="sr-only">Search teams</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search teams"
            />
          </label>
          <div className="team-directory-filters">
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
              <span className="sr-only">Sort teams</span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as 'name' | 'ats')
                }
              >
                <option value="name">Name</option>
                <option value="ats">ATS rate</option>
              </select>
            </label>
          </div>
          <div className="player-list">
            {visibleTeams.map((team) => (
              <a
                className={team.slug === selected?.slug ? 'active' : ''}
                key={team.key}
                href={pathForTeam(team.slug)}
                onClick={(event) => {
                  event.preventDefault()
                  onSelectTeam(team.slug)
                }}
              >
                <span>{formatRankedTeamName(team.name, team.rank)}</span>
                <small>
                  {team.conference ?? team.sport} · {team.overall.detail}
                </small>
              </a>
            ))}
          </div>
        </aside>

        <section className="player-detail" id={TEAM_PROFILE_HASH}>
          {selected ? (
            <>
              <div className="player-detail-heading">
                <div className="team-detail-title">
                  {selected.teamId && (
                    <TeamLogo team={{ id: selected.teamId }} />
                  )}
                  <div>
                    <p className="eyebrow">
                      {selected.sport}
                      {selected.conference ? ` · ${selected.conference}` : ''}
                    </p>
                    <h2>{formatRankedTeamName(selected.name, selected.rank)}</h2>
                    {rankTrail && (
                      <p className="team-rank-trail">
                        CBS rank · {rankTrail}
                      </p>
                    )}
                    {selectedProfile && (
                      <div className="player-archetype">
                        <strong>{selectedProfile.archetype}</strong>
                        <span>{selectedProfile.archetypeDetail}</span>
                        {selectedProfile.insight && (
                          <p className="player-insight">
                            {selectedProfile.insight}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <InjuryLink
                  className="team-injuries-link"
                  team={selected}
                >
                  CBS injuries
                </InjuryLink>
              </div>

              <section className="week-card team-split-card">
                <div className="week-card-heading">
                  <div>
                    <span>CBS line</span>
                    <strong>Performance</strong>
                    <small>Home, road, favorite, and dog ATS</small>
                  </div>
                </div>
                <div className="tendency-grid" aria-label="Team CBS ATS splits">
                  <Metric label="Overall" split={selected.overall} />
                  <Metric label="Home" split={selected.home} />
                  <Metric label="Away" split={selected.away} />
                  <Metric label="Favorite" split={selected.favorite} />
                  <Metric label="Dog" split={selected.dog} />
                  <Metric
                    label="Won outright as a dog"
                    split={selected.dogOutright}
                    hint="Straight-up wins when this team was an ATS underdog"
                  />
                </div>
              </section>

              <section className="week-card team-split-card">
                <div className="week-card-heading">
                  <div>
                    <span>Kickoff weather</span>
                    <strong>Weather</strong>
                    <small>Frozen kickoff hour only.</small>
                  </div>
                </div>
                <div className="tendency-grid" aria-label="Team weather ATS splits">
                  <Metric
                    label="Benign"
                    split={selected.benign}
                    hint="Fair outdoor weather"
                  />
                  <Metric
                    label="Adverse"
                    split={selected.adverse}
                    hint="Wet or 15+ mph wind"
                  />
                  <Metric
                    label="Wet"
                    split={selected.wet}
                    hint="Rain, snow, or 40%+ chance"
                  />
                  <Metric
                    label="Windy"
                    split={selected.windy}
                    hint="15 mph or more"
                  />
                  <Metric
                    label="Hot"
                    split={selected.hot}
                    hint="85°F or warmer"
                  />
                  <Metric
                    label="Cold"
                    split={selected.cold}
                    hint="35°F or colder"
                  />
                  <Metric
                    label="Indoor"
                    split={selected.indoor}
                    hint="Dome or closed roof"
                  />
                </div>
              </section>

              <section className="week-card team-split-card">
                <div className="week-card-heading">
                  <div>
                    <span>Time-zone hops</span>
                    <strong>Travel</strong>
                    <small>
                      Visitor hops, or a home team that left its own zone.
                    </small>
                  </div>
                </div>
                <div className="tendency-grid" aria-label="Team travel ATS splits">
                  <Metric
                    label="1 time zone"
                    split={selected.oneZone}
                    hint="One time-zone hop"
                  />
                  <Metric
                    label="2 time zones"
                    split={selected.twoZones}
                    hint="Two time-zone hops"
                  />
                  <Metric
                    label="3+ time zones"
                    split={selected.threePlus}
                    hint="Three or more time-zone hops"
                  />
                </div>
              </section>

              <section className="week-card team-split-card">
                <div className="week-card-heading">
                  <div>
                    <span>CBS-card gap</span>
                    <strong>Rest</strong>
                    <small>
                      Days since this team&apos;s last CBS-card kickoff.
                      Bye is NFL-only.
                    </small>
                  </div>
                </div>
                <div className="tendency-grid" aria-label="Team rest ATS splits">
                  <Metric
                    label="Short week"
                    split={selected.shortRest}
                    hint={travelRestTitle()}
                  />
                  <Metric
                    label="Normal rest"
                    split={selected.normalRest}
                    hint="6–8 days since the last card game"
                  />
                  <Metric
                    label="Long week"
                    split={selected.longRest}
                    hint="9+ days; college card gaps are not byes"
                  />
                  <Metric
                    label="Off a bye"
                    split={selected.byeRest}
                    hint={travelRestTitle()}
                  />
                </div>
              </section>

              <div className="week-card">
                <div className="week-card-heading">
                  <div>
                    <span>CBS line</span>
                    <strong>Appearances</strong>
                  </div>
                </div>
                <div className="pick-history-list">
                  {selected.appearances.length === 0 ? (
                    <p className="team-empty">No games on the frozen card yet.</p>
                  ) : (
                    selected.appearances.map((row) => {
                      const beat = seasonBeats.find(
                        (entry) =>
                          entry.cbsEventId === row.cbsEventId &&
                          entry.seasonYear === slate.pool.seasonYear,
                      )
                      const score = formatWinningScore(row)
                      const poolPick = ourPoolPickOnSide(
                        playerHistory,
                        row.week,
                        row.cbsEventId,
                        row.venue,
                      )
                      const beatMark = beat ? badBeatSideMark(poolPick) : null
                      const weatherLabel = formatWeatherBucket(row.weather)
                      const rankStamp = formatRankStamp(row.rank, showUnranked)
                      return (
                      <div className="history-pick has-row-menu" key={row.cbsEventId}>
                        <div className="history-matchup">
                          <span>
                            {row.weekLabel}
                            {' · '}
                            <time dateTime={row.kickoff}>
                              {formatGameDate(row.kickoff)}
                            </time>
                          </span>
                          <strong>
                            {rankStamp && (
                              <>
                                {rankStamp === 'unranked' ? 'Unranked' : rankStamp}
                                {' · '}
                              </>
                            )}
                            {row.venue === 'home' ? 'vs' : 'at'}{' '}
                            {formatRankedTeamName(row.opponent, row.opponentRank)}
                            {beat && beatMark && (
                              <a
                                className="bad-beat-mark"
                                href={pathForBadBeat(
                                  beat.seasonYear,
                                  beat.cbsEventId,
                                )}
                                title={beatMark.label}
                                aria-label={beatMark.label}
                                onClick={(event) => {
                                  event.preventDefault()
                                  onOpenBadBeats(
                                    badBeatAnchorId(
                                      beat.seasonYear,
                                      beat.cbsEventId,
                                    ),
                                  )
                                }}
                              >
                                {beatMark.emoji}
                              </a>
                            )}
                          </strong>
                          <small>
                            CBS {teamLine(row)} · {row.market}
                            {poolPick && (
                              <>
                                {' · '}
                                <span className={`our-pool-pick ${poolPick}`}>
                                  {poolPick === 'picked'
                                    ? 'Our pick'
                                    : 'Not our pick'}
                                </span>
                              </>
                            )}
                            {weatherLabel && (
                              <>
                                {' · '}
                                {weatherLabel}
                              </>
                            )}
                            {row.travel && row.travel.direction !== 'same' && (
                              <>
                                {' · '}
                                {row.travel.label}
                              </>
                            )}
                            {row.rest && (
                              <>
                                {' · '}
                                <span title={travelRestTitle()}>{row.rest.label}</span>
                              </>
                            )}
                          </small>
                        </div>
                        <span
                          className={`pick-result ${row.result ?? 'pending'}`}
                        >
                          {resultLabel(row.result)}
                          {score && (
                            <small>
                              {score}
                              {wonOutrightAsDog(row) ? ' · outright' : ''}
                            </small>
                          )}
                        </span>
                        <BadBeatMenu
                          beat={beat}
                          onClear={onClearBadBeat}
                          onMark={() =>
                            onMarkBadBeat(
                              appearanceBeat(selected, row, slate.pool.seasonYear),
                            )
                          }
                        />
                      </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          ) : selectedSlug ? (
            <div className="empty-state">
              No team matches <code>/{selectedSlug}</code>.
            </div>
          ) : (
            <div className="empty-state">No teams match this filter.</div>
          )}
        </section>
      </section>
    </main>
  )
}

function appearanceBeat(
  team: TeamRecord,
  row: TeamAppearance,
  seasonYear: number,
): Omit<BadBeat, 'markedAt'> {
  return {
    seasonYear,
    week: row.week,
    weekLabel: row.weekLabel,
    cbsEventId: row.cbsEventId,
    kickoff: row.kickoff,
    away: row.venue === 'home' ? row.opponent : team.name,
    home: row.venue === 'home' ? team.name : row.opponent,
    homeSpread: row.homeSpread,
    note: null,
  }
}
