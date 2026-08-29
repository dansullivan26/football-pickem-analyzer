import { useMemo, useState } from 'react'
import TeamLogo from './TeamLogo'
import {
  buildTeamDirectory,
  type TeamAppearance,
  type TeamRecord,
  type TeamSplit,
} from './teamPerformance'
import type { RecommendationHistory, Slate } from './types'

function formatSpread(value: number) {
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? String(Math.abs(value))
    : Math.abs(value).toFixed(1)
  return value > 0 ? `+${points}` : `-${points}`
}

function teamLine(row: TeamAppearance) {
  const number = row.venue === 'home' ? row.homeSpread : row.homeSpread * -1
  return formatSpread(number)
}

function resultLabel(result: TeamAppearance['result']) {
  if (result === 'win') return 'Win'
  if (result === 'loss') return 'Loss'
  if (result === 'push') return 'Push'
  return 'Awaiting result'
}

function Metric({
  label,
  split,
}: {
  label: string
  split: TeamSplit
}) {
  return (
    <div className="tendency-card">
      <span>{label}</span>
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
  recommendations,
}: {
  slate: Slate
  recommendations: RecommendationHistory
}) {
  const directory = useMemo(
    () => buildTeamDirectory(slate, recommendations),
    [slate, recommendations],
  )
  const [query, setQuery] = useState('')
  const [league, setLeague] = useState<'all' | 'NCAAF' | 'NFL'>('all')
  const [sort, setSort] = useState<'name' | 'ats'>('name')
  const [selectedKey, setSelectedKey] = useState(directory.teams[0]?.key ?? '')

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

  const selected =
    visibleTeams.find((team) => team.key === selectedKey) ?? visibleTeams[0]
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
            Against the locked pool line, not DraftKings. Home, road,
            favorite, and dog splits fill in as covers are recorded.
          </p>
        </div>
        <div className="week-chip">
          <span>Teams with a result</span>
          <strong>{graded}</strong>
          <small>
            {directory.teams.length} on the{' '}
            {recommendations.weeks.length === 1 ? 'slate' : 'season'}
          </small>
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
              <button
                className={team.key === selected?.key ? 'active' : ''}
                key={team.key}
                type="button"
                onClick={() => setSelectedKey(team.key)}
              >
                <span>{team.name}</span>
                <small>
                  {team.conference ?? team.sport} · {team.overall.detail}
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="player-detail">
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
                    <h2>{selected.name}</h2>
                  </div>
                </div>
              </div>

              <div className="tendency-grid" aria-label="Team CBS ATS splits">
                <Metric label="Overall" split={selected.overall} />
                <Metric label="Home" split={selected.home} />
                <Metric label="Away" split={selected.away} />
                <Metric label="Favorite" split={selected.favorite} />
                <Metric label="Dog" split={selected.dog} />
              </div>

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
                    selected.appearances.map((row) => (
                      <div className="history-pick" key={row.cbsEventId}>
                        <div className="history-matchup">
                          <span>{row.weekLabel}</span>
                          <strong>
                            {row.venue === 'home' ? 'vs' : 'at'} {row.opponent}
                          </strong>
                          <small>
                            CBS {teamLine(row)} · {row.market}
                          </small>
                        </div>
                        <span
                          className={`pick-result ${row.result ?? 'pending'}`}
                        >
                          {resultLabel(row.result)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">No teams match this filter.</div>
          )}
        </section>
      </section>
    </main>
  )
}
