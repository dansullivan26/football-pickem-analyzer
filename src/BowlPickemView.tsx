import { useEffect, useMemo, useState } from 'react'
import {
  bowlConfidencePoints,
  rankBowlConfidence,
} from './bowlConfidence'
import lastYearSheetData from './data/bowl-sheet-2025.json'
import {
  BOWL_OPT_OUT_LABELS,
  BOWL_STAFF_CHANGE_LABELS,
  BOWL_STAFF_ROLE_LABELS,
  attachRosterToBowlGames,
  bowlStatusLabel,
  type BowlOptOut,
  type BowlPickemFile,
  type BowlStaffChange,
} from './bowlPickem'
import {
  bowlSheetMatchup,
  formatBowlSheetTsv,
  linesFromAdminSheet,
  linesFromRankedGames,
  type BowlSheetFile,
  type BowlSheetLine,
} from './bowlSheet'
import type { TeamRosterFile } from './teamRoster'

const lastYearSheet = lastYearSheetData as BowlSheetFile

function formatWhen(iso: string | null | undefined) {
  if (!iso) return null
  const stamp = Date.parse(iso)
  if (!Number.isFinite(stamp)) return null
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(stamp))
}

function SheetTable({ lines }: { lines: BowlSheetLine[] }) {
  return (
    <div className="bowl-sheet-wrap">
      <table className="bowl-sheet">
        <thead>
          <tr>
            <th>Date</th>
            <th>Bowl</th>
            <th className="sheet-extra">Location / time</th>
            <th>Away vs Home</th>
            <th>A or H</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key} className={line.tba ? 'tba' : undefined}>
              <td>{line.dateLabel || 'TBA'}</td>
              <td>
                <strong>{line.bowlName}</strong>
              </td>
              <td className="sheet-extra">
                {line.location ?? '—'}
                {line.timeLabel ? ` · ${line.timeLabel}` : ''}
              </td>
              <td>{bowlSheetMatchup(line.away, line.home)}</td>
              <td className="pick-code">{line.pick ?? '—'}</td>
              <td className={line.duplicate ? 'points dup' : 'points'}>
                {line.points ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [order, setOrder] = useState<'sheet' | 'confidence'>('sheet')
  const [copied, setCopied] = useState(false)
  const ranked = useMemo(
    () => rankBowlConfidence(attachRosterToBowlGames(file.games, teamRoster)),
    [file.games, teamRoster],
  )
  const awaiting = file.games.length === 0
  const lastYearLines = useMemo(
    () => linesFromAdminSheet(lastYearSheet),
    [],
  )
  const liveLines = useMemo(
    () => linesFromRankedGames(file.games, ranked, order),
    [file.games, ranked, order],
  )
  const lines = awaiting ? lastYearLines : liveLines
  const points = bowlConfidencePoints(ranked.length)
  const dupCount = lines.filter((line) => line.duplicate).length

  useEffect(() => {
    const previous = document.title
    document.title = "Bowl Pick'em · Pick'em Edge"
    return () => {
      document.title = previous
    }
  }, [])

  async function copySheet() {
    try {
      await navigator.clipboard.writeText(formatBowlSheetTsv(lines))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main>
      <section className="hero players-hero">
        <div>
          <p className="eyebrow">Straight-up · A or H · unique 1–N</p>
          <h1>Bowl Pick&apos;em</h1>
          <p className="hero-copy">
            The admin sheet is not ATS. Each row is a bowl in schedule
            order: pick A (away, left) or H (home, right), then assign a
            unique point value from 1 (least sure) through however many
            bowls there are. Last year that was 1–41. A number used twice
            is invalid. Later CFP games can still be TBA; they keep a
            confidence slot, and leftover low numbers usually land there.
            When DraftKings prices the slate, this page fills A/H from the
            favorite and points from spread size so the sheet is ready to
            paste.
          </p>
        </div>
        <div className="week-chip">
          <span>{seasonYear} bowls</span>
          <strong>{bowlStatusLabel(file.status)}</strong>
          <small>
            {awaiting
              ? `Last year: ${lastYearSheet.pointMax} games`
              : `${ranked.length} games · ${points} points on the card`}
          </small>
        </div>
      </section>

      <section className="week-card">
        <div className="week-card-heading">
          <div>
            <span>{awaiting ? '2025-26 admin sheet' : 'Sheet to submit'}</span>
            <strong>
              {awaiting
                ? `${lastYearSheet.pointMax} rows · A/H and unique points`
                : order === 'sheet'
                  ? 'Schedule order, like the workbook'
                  : `${ranked.length} down to 1`}
            </strong>
          </div>
          <div className="bowl-sheet-actions">
            {!awaiting ? (
              <label className="bowl-sheet-order">
                Order
                <select
                  value={order}
                  onChange={(event) =>
                    setOrder(event.target.value as 'sheet' | 'confidence')
                  }
                >
                  <option value="sheet">Sheet</option>
                  <option value="confidence">By points</option>
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="refresh-button in-page"
              onClick={() => void copySheet()}
            >
              {copied ? 'Copied' : 'Copy sheet'}
            </button>
          </div>
        </div>
        {awaiting ? (
          <p className="bowl-section-note">
            This is last year&apos;s filled workbook — 41 bowls, A or H,
            each point used once. Fiesta, Peach, and the title game were
            still TBA and took 2, 3, and 1. 2026 pairings are not on the
            board yet; the hourly DraftKings refresh will write them here
            once December/January NCAAF games are priced.
          </p>
        ) : (
          <p className="bowl-section-note">
            Suggested A/H is the DraftKings favorite on the sheet&apos;s
            home/away. Point values are unique, largest spread at the top
            of the 1…N range. Unpriced or TBA rows keep a slot at the
            bottom.
            {file.oddsUpdatedAt
              ? ` Last DK pull ${formatWhen(file.oddsUpdatedAt)}.`
              : ''}
            {dupCount
              ? ` ${dupCount} row${dupCount === 1 ? '' : 's'} share a point value — the admin sheet flags that in red.`
              : ''}
          </p>
        )}
        <SheetTable lines={lines} />
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
