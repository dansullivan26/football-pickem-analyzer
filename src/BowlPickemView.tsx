import { useEffect, useMemo, useState } from 'react'
import {
  bowlConfidencePoints,
  rankBowlConfidence,
} from './bowlConfidence'
import sandbox2025Data from './data/bowl-cfp-sandbox-2025.json'
import lastYearSheetData from './data/bowl-sheet-2025.json'
import {
  cfpTeamNames,
  hasBracketQuestions,
  pairLinesFromGames,
  resolveBowlGames,
  tbaSlotsFromGames,
  winnerForksFromGames,
  type BowlGuesses,
  type BowlPairLine,
  type TbaSlot,
  type WinnerFork,
} from './bowlBracket'
import {
  BOWL_OPT_OUT_LABELS,
  BOWL_STAFF_CHANGE_LABELS,
  BOWL_STAFF_ROLE_LABELS,
  attachRosterToBowlGames,
  bowlStatusLabel,
  type BowlGame,
  type BowlOptOut,
  type BowlPickemFile,
  type BowlStaffChange,
} from './bowlPickem'
import {
  bowlGamesFromAdminSheet,
  bowlSheetMatchup,
  formatBowlSheetTsv,
  linesFromAdminSheet,
  linesFromRankedGames,
  type BowlSheetFile,
  type BowlSheetLine,
} from './bowlSheet'
import type { TeamRosterFile } from './teamRoster'

const lastYearSheet = lastYearSheetData as BowlSheetFile
const sandbox2025Lines = sandbox2025Data.lines as BowlPairLine[]

type YearTab = '2026' | '2025'
type SheetMode = 'whatif' | 'submitted'

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
            <th>DK</th>
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
              <td className="sheet-extra">{line.spreadLabel}</td>
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

function GuessPanel({
  forks,
  tbaSlots,
  teams,
  guesses,
  onGuess,
  onClear,
  sandbox,
}: {
  forks: WinnerFork[]
  tbaSlots: TbaSlot[]
  teams: string[]
  guesses: BowlGuesses
  onGuess: (key: string, value: string) => void
  onClear: () => void
  sandbox?: boolean
}) {
  const tbaGames = new Map<string, TbaSlot[]>()
  for (const slot of tbaSlots) {
    const rows = tbaGames.get(slot.gameId) ?? []
    rows.push(slot)
    tbaGames.set(slot.gameId, rows)
  }

  return (
    <div className="bowl-guess-panel">
      <div className="bowl-guess-heading">
        <div>
          <span>CFP what-if</span>
          <strong>Guess who gets through</strong>
        </div>
        <button type="button" className="refresh-button in-page" onClick={onClear}>
          Reset guesses
        </button>
      </div>
      <p className="bowl-section-note">
        {sandbox
          ? 'Sandbox pair lines, not last year\'s closing numbers. Pick a first-round winner and Cotton / Orange / Rose / Sugar re-rank against the rest of the card. Fiesta, Peach, and the title stay unpriced until both sides are named and a pair line exists. Regular bowls have no sandbox spread, so they sit at the bottom — we did not backfill 41 closers, opt-outs, or staff moves.'
          : 'Later CFP rows can still be “winner of” or TBA when the sheet goes out. Pick the team you think lands in that slot. If DraftKings has already priced that pairing, the whole 1…N card reshuffles.'}
      </p>
      {forks.map((fork) => (
        <div className="bowl-guess-row" key={fork.key}>
          <span>Winner of {fork.label}</span>
          <div className="bowl-guess-options">
            {fork.options.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  guesses[fork.key] === option
                    ? 'generate-card-button'
                    : 'generate-card-button secondary'
                }
                onClick={() => onGuess(fork.key, option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
      {[...tbaGames.entries()].map(([gameId, slots]) => {
        const bowlName = slots[0]?.bowlName ?? 'Bowl game'
        return (
          <div className="bowl-guess-row" key={gameId}>
            <span>{bowlName}</span>
            <div className="bowl-guess-options">
              {slots.map((slot) => (
                <label key={slot.key} className="bowl-sheet-order">
                  {slot.side === 'away' ? 'Away' : 'Home'}
                  <select
                    value={guesses[slot.key] ?? ''}
                    onChange={(event) => onGuess(slot.key, event.target.value)}
                  >
                    <option value="">TBA</option>
                    {teams.map((team) => (
                      <option key={`${slot.key}-${team}`} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )
      })}
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
  const [yearTab, setYearTab] = useState<YearTab>('2026')
  const [sheetMode, setSheetMode] = useState<SheetMode>('whatif')
  const [order, setOrder] = useState<'sheet' | 'confidence'>('sheet')
  const [copied, setCopied] = useState(false)
  const [liveGuesses, setLiveGuesses] = useState<BowlGuesses>({})
  const [demoGuesses, setDemoGuesses] = useState<BowlGuesses>({})

  const liveBase = useMemo(
    () => attachRosterToBowlGames(file.games, teamRoster),
    [file.games, teamRoster],
  )
  const demoBase = useMemo(
    () => bowlGamesFromAdminSheet(lastYearSheet),
    [],
  )
  const liveResolved = useMemo(
    () =>
      resolveBowlGames(
        liveBase,
        liveGuesses,
        pairLinesFromGames(liveBase),
      ),
    [liveBase, liveGuesses],
  )
  const demoResolved = useMemo(
    () => resolveBowlGames(demoBase, demoGuesses, sandbox2025Lines),
    [demoBase, demoGuesses],
  )

  const showing2025 = yearTab === '2025'
  const showingSubmitted = showing2025 && sheetMode === 'submitted'
  const activeGames: BowlGame[] = showing2025 ? demoResolved : liveResolved
  const ranked = useMemo(
    () => rankBowlConfidence(activeGames),
    [activeGames],
  )
  const liveLines = useMemo(
    () => linesFromRankedGames(activeGames, ranked, order),
    [activeGames, ranked, order],
  )
  const submittedLines = useMemo(
    () => linesFromAdminSheet(lastYearSheet),
    [],
  )
  const lines = showingSubmitted ? submittedLines : liveLines
  const awaiting = !showing2025 && file.games.length === 0
  const points = bowlConfidencePoints(ranked.length)
  const dupCount = lines.filter((line) => line.duplicate).length
  const forks = showing2025
    ? winnerForksFromGames(demoBase)
    : winnerForksFromGames(liveBase)
  const tbaSlots = showing2025
    ? tbaSlotsFromGames(demoBase)
    : tbaSlotsFromGames(liveBase)
  const teams = showing2025 ? cfpTeamNames(demoBase) : cfpTeamNames(liveBase)
  const guesses = showing2025 ? demoGuesses : liveGuesses
  const setGuesses = showing2025 ? setDemoGuesses : setLiveGuesses
  const showGuesses =
    !showingSubmitted && hasBracketQuestions(showing2025 ? demoBase : liveBase)

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
            unique point value. Last year that was 1–41. Later CFP games
            can still be “winner of Miami / Texas AM” or TBA; guess who
            lands there and the whole card re-ranks when a spread exists
            for that pairing.
          </p>
        </div>
        <div className="week-chip">
          <span>{showing2025 ? '2025-26 demo' : `${seasonYear} bowls`}</span>
          <strong>
            {showing2025
              ? sheetMode === 'submitted'
                ? 'As submitted'
                : 'What-if'
              : bowlStatusLabel(file.status)}
          </strong>
          <small>
            {showing2025
              ? `${lastYearSheet.pointMax} games from the workbook`
              : awaiting
                ? 'No 2026 matchups posted yet'
                : `${ranked.length} games · ${points} points on the card`}
          </small>
        </div>
      </section>

      <div className="bowl-year-tabs" role="tablist" aria-label="Bowl season">
        <button
          type="button"
          role="tab"
          aria-selected={yearTab === '2026'}
          className={
            yearTab === '2026'
              ? 'generate-card-button'
              : 'generate-card-button secondary'
          }
          onClick={() => setYearTab('2026')}
        >
          {seasonYear}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={yearTab === '2025'}
          className={
            yearTab === '2025'
              ? 'generate-card-button'
              : 'generate-card-button secondary'
          }
          onClick={() => setYearTab('2025')}
        >
          2025 demo
        </button>
      </div>

      {showGuesses ? (
        <GuessPanel
          forks={forks}
          tbaSlots={tbaSlots}
          teams={teams}
          guesses={guesses}
          sandbox={showing2025}
          onGuess={(key, value) =>
            setGuesses((current) => {
              const next = { ...current }
              if (!value) delete next[key]
              else next[key] = value
              return next
            })
          }
          onClear={() => setGuesses({})}
        />
      ) : null}

      <section className="week-card">
        <div className="week-card-heading">
          <div>
            <span>
              {showing2025
                ? sheetMode === 'submitted'
                  ? '2025-26 admin sheet'
                  : '2025 what-if card'
                : awaiting
                  ? 'Waiting on 2026 bowls'
                  : 'Sheet to submit'}
            </span>
            <strong>
              {showingSubmitted
                ? `${lastYearSheet.pointMax} rows · A/H and unique points`
                : awaiting
                  ? 'Use the 2025 demo to walk the CFP forks'
                  : order === 'sheet'
                    ? 'Schedule order, like the workbook'
                    : `${ranked.length} down to 1`}
            </strong>
          </div>
          <div className="bowl-sheet-actions">
            {showing2025 ? (
              <label className="bowl-sheet-order">
                View
                <select
                  value={sheetMode}
                  onChange={(event) =>
                    setSheetMode(event.target.value as SheetMode)
                  }
                >
                  <option value="whatif">What-if rank</option>
                  <option value="submitted">As submitted</option>
                </select>
              </label>
            ) : null}
            {!awaiting && !showingSubmitted ? (
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
            2026 pairings are not priced yet. Open the 2025 demo to show
            last year&apos;s 41-game workbook and click Miami vs Texas AM
            to watch Cotton&apos;s point value move.
          </p>
        ) : showingSubmitted ? (
          <p className="bowl-section-note">
            Last year&apos;s filled workbook — 41 bowls, A or H, each
            point used once. Fiesta, Peach, and the title game were still
            TBA and took 2, 3, and 1.
          </p>
        ) : showing2025 ? (
          <p className="bowl-section-note">
            Suggested A/H is the favorite on the resolved matchup. Point
            values are unique. Switch a first-round winner and the 1…N
            column updates immediately.
            {dupCount
              ? ` ${dupCount} row${dupCount === 1 ? '' : 's'} share a point value.`
              : ''}
          </p>
        ) : (
          <p className="bowl-section-note">
            Suggested A/H is the DraftKings favorite. Point values rank
            by absolute spread. Unpriced or TBA rows keep a slot at the
            bottom.
            {file.oddsUpdatedAt
              ? ` Last DK pull ${formatWhen(file.oddsUpdatedAt)}.`
              : ''}
            {dupCount
              ? ` ${dupCount} row${dupCount === 1 ? '' : 's'} share a point value — the admin sheet flags that in red.`
              : ''}
          </p>
        )}
        {awaiting ? null : <SheetTable lines={lines} />}
      </section>

      {showing2025 ? null : (
        <>
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
                No sit-outs yet. Spreads will move when stars declare for
                the draft or enter the portal; this list is the roster of
                names, not a second model.
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
                No head-coach changes recorded against the
                CollegeFootballData snapshot yet. Taking that snapshot now
                — before the carousel — is what makes a December hire show
                up as a real diff instead of the new normal.
              </p>
            ) : (
              <div className="pick-history-list">
                {file.staffChanges.map((row) => (
                  <StaffRow key={row.id} row={row} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
