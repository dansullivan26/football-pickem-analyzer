import { useMemo, useState } from 'react'
import type {
  PlayerHistory,
  PlayerPick,
  PlayerWeek,
} from './types'

function formatSpread(value: number) {
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? Math.abs(value).toFixed(0)
    : Math.abs(value).toFixed(1)
  return value > 0 ? `+${points}` : `-${points}`
}

function pickLabel(pick: PlayerPick) {
  if (!pick.pickedSide || !pick.pickedTeam) return 'No pick recorded'
  const spread =
    pick.pickedSide === 'home' ? pick.homeSpread : pick.homeSpread * -1
  return `${pick.pickedTeam} ${formatSpread(spread)}`
}

function resultLabel(pick: PlayerPick) {
  if (pick.matchStatus === 'ambiguous') return 'Needs review'
  if (pick.matchStatus === 'unmatched') return 'Unmatched'
  if (!pick.pickedSide) return 'Awaiting results'
  if (!pick.result) return 'Pending'
  return pick.result
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

function summarizePlayer(entryId: string, weeks: PlayerWeek[]) {
  const picks = weeks.flatMap(
    (week) =>
      week.entries.find((entry) => entry.entryId === entryId)?.picks ?? [],
  )
  const made = picks.filter((pick) => pick.pickedSide)
  const scored = made.filter((pick) => pick.result)
  const home = made.filter((pick) => pick.pickedSide === 'home')
  const favorites = made.filter(
    (pick) =>
      (pick.homeSpread < 0 && pick.pickedSide === 'home') ||
      (pick.homeSpread > 0 && pick.pickedSide === 'away'),
  )
  const wins = scored.filter((pick) => pick.result === 'win')

  const percent = (count: number) =>
    made.length ? `${Math.round((count / made.length) * 100)}%` : '—'

  return {
    made: made.length,
    scored: scored.length,
    homeRate: percent(home.length),
    favoriteRate: percent(favorites.length),
    winRate: scored.length
      ? `${Math.round((wins.length / scored.length) * 100)}%`
      : '—',
  }
}

export default function PlayersView({ history }: { history: PlayerHistory }) {
  const [query, setQuery] = useState('')
  const [selectedEntryId, setSelectedEntryId] = useState(
    history.entries[0]?.entryId ?? '',
  )
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(
    history.weeks.at(-1)?.week ?? 1,
  )

  const filteredPlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return history.entries
    return history.entries.filter((entry) =>
      entry.name.toLowerCase().includes(normalized),
    )
  }, [history.entries, query])

  const selectedPlayer =
    history.entries.find((entry) => entry.entryId === selectedEntryId) ??
    history.entries[0]
  const selectedWeek =
    history.weeks.find((week) => week.week === selectedWeekNumber) ??
    history.weeks.at(-1)
  const weekEntry = selectedWeek?.entries.find(
    (entry) => entry.entryId === selectedPlayer?.entryId,
  )
  const summary = selectedPlayer
    ? summarizePlayer(selectedPlayer.entryId, history.weeks)
    : null
  const scoredWeeks = history.weeks.filter((week) => week.scored).length

  return (
    <main>
      <section className="hero players-hero">
        <div>
          <p className="eyebrow">Player history</p>
          <h1>Pool tendencies</h1>
          <p className="hero-copy">
            Track every weekly card, then compare how each player approaches
            favorites, underdogs, home teams, and the locked CBS line.
          </p>
        </div>
        <div className="week-chip">
          <span>History loaded</span>
          <strong>{history.entries.length} players</strong>
          <small>
            {scoredWeeks} scored {scoredWeeks === 1 ? 'week' : 'weeks'}
          </small>
        </div>
      </section>

      {scoredWeeks === 0 && (
        <div className="notice">
          Week 1 is ready for Tuesday&apos;s scored export. Tendencies will
          populate automatically once picks and results are available.
        </div>
      )}

      <section className="players-layout">
        <aside className="player-directory" aria-label="Pool players">
          <div className="directory-heading">
            <div>
              <p className="eyebrow">Pool roster</p>
              <h2>Players</h2>
            </div>
            <span>{filteredPlayers.length}</span>
          </div>
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
            {filteredPlayers.map((entry) => (
              <button
                className={
                  entry.entryId === selectedPlayer?.entryId ? 'active' : ''
                }
                key={entry.entryId}
                type="button"
                onClick={() => setSelectedEntryId(entry.entryId)}
              >
                <span>{entry.name}</span>
                <small>
                  {entry.season.rank ? `Season rank ${entry.season.rank}` : 'No results yet'}
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="player-detail">
          {selectedPlayer && summary && (
            <>
              <div className="player-detail-heading">
                <div>
                  <p className="eyebrow">Player profile</p>
                  <h2>{selectedPlayer.name}</h2>
                </div>
                <label>
                  <span className="sr-only">Select week</span>
                  <select
                    value={selectedWeek?.week}
                    onChange={(event) =>
                      setSelectedWeekNumber(Number(event.target.value))
                    }
                  >
                    {history.weeks.map((week) => (
                      <option key={week.periodId} value={week.week}>
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
                  detail={`${summary.scored} scored`}
                />
                <Metric
                  label="Favorites"
                  value={summary.favoriteRate}
                  detail="Share of recorded picks"
                />
                <Metric
                  label="Home teams"
                  value={summary.homeRate}
                  detail="Share of recorded picks"
                />
                <Metric
                  label="Win rate"
                  value={summary.winRate}
                  detail="Pushes excluded"
                />
              </div>

              <div className="week-card">
                <div className="week-card-heading">
                  <div>
                    <span>{selectedWeek?.label}</span>
                    <strong>
                      {selectedWeek?.scored ? 'Final picks' : 'Picks not yet public'}
                    </strong>
                  </div>
                  <div className="week-score">
                    <span>Week score</span>
                    <strong>{weekEntry?.weekScore ?? '—'}</strong>
                  </div>
                </div>

                <div className="pick-history-list">
                  {weekEntry?.picks.map((pick) => (
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
                        <strong>{pickLabel(pick)}</strong>
                      </div>
                      <span
                        className={`pick-result ${pick.result ?? pick.matchStatus}`}
                      >
                        {resultLabel(pick)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  )
}
