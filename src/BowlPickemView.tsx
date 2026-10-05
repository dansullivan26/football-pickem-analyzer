import { useEffect, useMemo } from 'react'
import {
  EXAMPLE_BOWL_GAMES,
  bowlConfidencePoints,
  favoriteLineLabel,
  rankBowlConfidence,
  type BowlConfidenceRow,
} from './bowlConfidence'
import {
  BOWL_OPT_OUT_LABELS,
  BOWL_STAFF_CHANGE_LABELS,
  BOWL_STAFF_ROLE_LABELS,
  attachRosterToBowlGames,
  bowlMatchupLabel,
  bowlStatusLabel,
  formatBowlSpread,
  type BowlOptOut,
  type BowlPickemFile,
  type BowlStaffChange,
} from './bowlPickem'
import TeamLogo from './TeamLogo'
import type { TeamRosterFile } from './teamRoster'

function formatKickoff(iso: string | null) {
  if (!iso) return 'Kickoff TBA'
  const stamp = Date.parse(iso)
  if (!Number.isFinite(stamp)) return 'Kickoff TBA'
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(stamp))
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return null
  const stamp = Date.parse(iso)
  if (!Number.isFinite(stamp)) return null
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(stamp))
}

function ConfidenceRow({
  row,
  maxConfidence,
}: {
  row: BowlConfidenceRow
  maxConfidence: number
}) {
  const homeId = row.game.home.teamId
  const awayId = row.game.away.teamId
  return (
    <div className="history-pick bowl-confidence-row">
      <div
        className={
          row.confidence === maxConfidence
            ? 'bowl-confidence-rank top'
            : 'bowl-confidence-rank'
        }
      >
        <span>{row.confidence}</span>
      </div>
      <div className="history-matchup">
        <span>
          {row.game.bowlName ?? 'Bowl game'}
          {' · '}
          {formatKickoff(row.game.kickoff)}
        </span>
        <strong className="bowl-matchup-teams">
          {awayId ? <TeamLogo team={{ id: awayId }} /> : null}
          {bowlMatchupLabel(row.game)}
          {homeId ? <TeamLogo team={{ id: homeId }} /> : null}
        </strong>
        <small>
          {row.priced
            ? `DraftKings ${row.game.home.name} ${formatBowlSpread(row.game.homeSpread)}`
            : 'Waiting on a DraftKings spread'}
        </small>
      </div>
      <div className="history-selection">
        <span>Straight-up pick</span>
        <strong>{favoriteLineLabel(row)}</strong>
      </div>
    </div>
  )
}

function OptOutRow({ row }: { row: BowlOptOut }) {
  return (
    <div className="history-pick">
      <div className="history-matchup">
        <span>{BOWL_OPT_OUT_LABELS[row.reason]}</span>
        <strong>
          {row.player}
          {row.position ? ` · ${row.position}` : ''}
        </strong>
        <small>{row.team}</small>
      </div>
      <div className="history-selection">
        <span>{formatWhen(row.reportedAt) ?? 'Date TBA'}</span>
        <strong>{row.detail ?? 'Listed sit-out'}</strong>
      </div>
    </div>
  )
}

function StaffRow({ row }: { row: BowlStaffChange }) {
  return (
    <div className="history-pick">
      <div className="history-matchup">
        <span>
          {BOWL_STAFF_ROLE_LABELS[row.role]} · {BOWL_STAFF_CHANGE_LABELS[row.change]}
        </span>
        <strong>{row.person}</strong>
        <small>{row.team}</small>
      </div>
      <div className="history-selection">
        <span>{formatWhen(row.reportedAt) ?? 'Date TBA'}</span>
        <strong>
          {row.change === 'departed' && row.destination
            ? `To ${row.destination}`
            : row.change === 'hired' && row.previousTeam
              ? `From ${row.previousTeam}`
              : row.destination ?? row.previousTeam ?? 'Move recorded'}
        </strong>
      </div>
    </div>
  )
}

export default function BowlPickemView({
  file,
  seasonYear,
  teamRoster,
}: {
  file: BowlPickemFile
  seasonYear: number
  teamRoster: TeamRosterFile
}) {
  const ranked = useMemo(
    () => rankBowlConfidence(attachRosterToBowlGames(file.games, teamRoster)),
    [file.games, teamRoster],
  )
  const example = useMemo(
    () => rankBowlConfidence(EXAMPLE_BOWL_GAMES),
    [],
  )
  const awaiting = file.games.length === 0
  const rows = awaiting ? example : ranked
  const maxConfidence = rows[0]?.confidence ?? 0
  const points = bowlConfidencePoints(ranked.length)

  useEffect(() => {
    const previous = document.title
    document.title = "Bowl Pick'em · Pick'em Edge"
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <main>
      <section className="hero players-hero">
        <div>
          <p className="eyebrow">Straight-up · confidence points</p>
          <h1>Bowl Pick&apos;em</h1>
          <p className="hero-copy">
            Separate from the weekly ATS pool. When CBS opens the bowl
            challenge you pick winners, not covers, and assign every game a
            unique confidence value — 1 is the toss-up, and the number of
            bowls is the lock. This page ranks DraftKings favorites by
            spread size so the card is ready as soon as matchups hit the
            board. Opt-outs and coaching moves sit next to the ranking;
            they are already in the number, but it helps to see the names.
          </p>
        </div>
        <div className="week-chip">
          <span>{seasonYear} bowls</span>
          <strong>{bowlStatusLabel(file.status)}</strong>
          <small>
            {awaiting
              ? 'No matchups posted yet'
              : `${ranked.length} games · ${points} points on the card`}
          </small>
        </div>
      </section>

      <section className="week-card">
        <div className="week-card-heading">
          <div>
            <span>{awaiting ? 'Preview ranking' : 'Suggested confidence card'}</span>
            <strong>
              {awaiting
                ? 'Biggest favorite gets the high number'
                : `${maxConfidence} down to 1`}
            </strong>
          </div>
        </div>
        {awaiting ? (
          <p className="bowl-section-note">
            Bowl pairings are still months out. The hourly DraftKings
            refresh already watches NCAAF rows whose kickoff falls in the
            Dec 16–Jan 21 window, so this list fills itself once those
            games are priced. The rows below are a fake four-game card so
            the sort is visible now: 14.5, 7, 3, then a pick&apos;em.
          </p>
        ) : (
          <p className="bowl-section-note">
            Ranked by absolute DraftKings home spread. Straight-up pick is
            the favorite. Unpriced games fall to the bottom and keep a
            confidence slot so the 1…N assignment stays complete.
            {file.oddsUpdatedAt
              ? ` Last DK pull ${formatWhen(file.oddsUpdatedAt)}.`
              : ''}
          </p>
        )}
        <div className="pick-history-list">
          {rows.map((row) => (
            <ConfidenceRow
              key={row.game.id}
              row={row}
              maxConfidence={maxConfidence}
            />
          ))}
        </div>
      </section>

      <section className="week-card">
        <div className="week-card-heading">
          <div>
            <span>Player opt-outs</span>
            <strong>
              {file.optOuts.length === 0
                ? 'None recorded'
                : `${file.optOuts.length} listed`}
            </strong>
          </div>
        </div>
        {file.optOuts.length === 0 ? (
          <p className="team-empty">
            No sit-outs yet. Spreads will move when stars declare for the
            draft or enter the portal; this list is the roster of names,
            not a second model. Record a player here once they are
            confirmed out.
          </p>
        ) : (
          <div className="pick-history-list">
            {file.optOuts.map((row) => (
              <OptOutRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>

      <section className="week-card">
        <div className="week-card-heading">
          <div>
            <span>Staff turnover</span>
            <strong>
              {file.staffChanges.length === 0
                ? 'Baseline pending'
                : `${file.staffChanges.length} moves`}
            </strong>
          </div>
        </div>
        {file.staffChanges.length === 0 ? (
          <p className="team-empty">
            No head-coach changes recorded against the CollegeFootballData
            snapshot yet. Taking that snapshot now — before the carousel —
            is what makes a December hire show up as a real diff instead of
            the new normal.
          </p>
        ) : (
          <div className="pick-history-list">
            {file.staffChanges.map((row) => (
              <StaffRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
