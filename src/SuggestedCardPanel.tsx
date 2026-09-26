import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  applyDaySendSelection,
  daySendState,
  formatCardKickoff,
  formatPoolSpread,
  formatSuggestedCardText,
  groupCardRowsByDay,
  orderCardRows,
  recommendedGameIdsForDay,
  sortSuggestedPicks,
  submittedPick,
  type SuggestedCard,
  type SuggestedPick,
  type UnpickedGame,
} from './cardStrategy'
import { rememberedDeviationIds, storeDeviationIds } from './cardOverrides'
import { COMPOSITE_EDGE_SCALE } from './cardScoring'
import { completeCardPasswordMatches, sendCardToGrokBot } from './completeCard'
import {
  poolSupportView,
  type PoolProjection,
} from './cardPoolAware'
import { PoolSupportNote } from './PoolSupportNote'

export default function SuggestedCardPanel({
  card,
  poolProjections,
  savedDeviationIds = [],
  onClose,
}: {
  card: SuggestedCard
  poolProjections?: ReadonlyMap<number, PoolProjection>
  savedDeviationIds?: Iterable<string>
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [sort, setSort] = useState<'recommendation' | 'slate'>('slate')
  const [submitting, setSubmitting] = useState(false)
  const [askPassword, setAskPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [manualSelections, setManualSelections] = useState<
    Map<string, 'home' | 'away'>
  >(() => new Map())
  const [selectedToSend, setSelectedToSend] = useState<Set<string>>(
    () => new Set(),
  )
  const [deviations, setDeviations] = useState<Set<string>>(
    () =>
      new Set(
        rememberedDeviationIds({
          week: card.week,
          seasonYear: card.seasonYear,
          savedIds: savedDeviationIds,
          pickIds: card.picks.map((pick) => pick.gameId),
        }),
      ),
  )
  const [tiebreakerAnswer, setTiebreakerAnswer] = useState('')
  const [tiebreakerError, setTiebreakerError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const generated = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(card.generatedAt))
  const picks = useMemo(
    () => sortSuggestedPicks(card.picks, sort),
    [card.picks, sort],
  )
  const rows = useMemo(
    () => orderCardRows(card.picks, card.unpicked, sort),
    [card.picks, card.unpicked, sort],
  )
  const dayGroups = useMemo(() => groupCardRowsByDay(rows), [rows])
  const selectedRecommendedCount = card.picks.filter((pick) =>
    selectedToSend.has(pick.gameId),
  ).length
  const selectedManualCount = [...manualSelections.keys()].filter((gameId) =>
    selectedToSend.has(gameId),
  ).length
  const selectedCount = selectedRecommendedCount + selectedManualCount
  const selectedDeviationCount = card.picks.filter(
    (pick) =>
      selectedToSend.has(pick.gameId) && deviations.has(pick.gameId),
  ).length

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (askPassword) {
        setAskPassword(false)
        return
      }
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [askPassword, onClose])

  useEffect(() => {
    if (askPassword) passwordRef.current?.focus()
  }, [askPassword])

  async function copyCard() {
    try {
      const answer = readTiebreakerAnswer()
      await navigator.clipboard.writeText(
        formatSuggestedCardText(
          card,
          picks,
          deviations,
          answer,
          manualSelections,
          sort,
        ),
      )
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function readTiebreakerAnswer() {
    if (!tiebreakerAnswer.trim()) return null
    const answer = Number(tiebreakerAnswer)
    return Number.isInteger(answer) && answer >= 0 ? answer : null
  }

  function toggleDeviate(gameId: string) {
    setDeviations((current) => {
      const next = new Set(current)
      if (next.has(gameId)) next.delete(gameId)
      else next.add(gameId)
      return next
    })
  }

  function toggleSend(gameId: string) {
    setSelectedToSend((current) => {
      const next = new Set(current)
      if (next.has(gameId)) next.delete(gameId)
      else next.add(gameId)
      return next
    })
  }

  function selectAllForSend() {
    setSelectedToSend(
      new Set([
        ...card.picks.map((pick) => pick.gameId),
        ...manualSelections.keys(),
      ]),
    )
  }

  function toggleDaySend(dayIds: string[], send: boolean) {
    setSelectedToSend((current) => applyDaySendSelection(current, dayIds, send))
  }

  function toggleManualPick(gameId: string, side: 'home' | 'away') {
    const clearing = manualSelections.get(gameId) === side
    setManualSelections((current) => {
      const next = new Map(current)
      if (next.get(gameId) === side) next.delete(gameId)
      else next.set(gameId, side)
      return next
    })
    setSelectedToSend((current) => {
      const next = new Set(current)
      if (clearing) next.delete(gameId)
      else next.add(gameId)
      return next
    })
  }

  function openPasswordPrompt() {
    if (
      tiebreakerAnswer.trim() &&
      readTiebreakerAnswer() == null
    ) {
      setTiebreakerError('Enter a whole number of points, or leave it blank.')
      return
    }
    setPassword('')
    setPasswordError(null)
    setAskPassword(true)
  }

  async function completeCard(event: FormEvent) {
    event.preventDefault()
    if (!completeCardPasswordMatches(password)) {
      setPasswordError('Wrong password.')
      return
    }

    setAskPassword(false)
    setSubmitting(true)
    setSubmitResult(null)
    try {
      await sendCardToGrokBot(
        card,
        deviations,
        readTiebreakerAnswer(),
        manualSelections,
        selectedToSend,
      )
      storeDeviationIds(card.seasonYear, card.week, deviations)
      setSubmitResult({
        kind: 'success',
        message:
          'Card handed off. GrokBot will post it in chat for your confirmation before anything is saved on CBS.',
      })
    } catch (error) {
      setSubmitResult({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Could not send the card to GrokBot.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="suggested-card-overlay"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="suggested-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggested-card-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="suggested-card-dismiss"
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3.2 3.2 12.8 12.8M12.8 3.2 3.2 12.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="suggested-card-body">
        <div className="suggested-card-header">
          <div>
            <p className="eyebrow">{card.title}</p>
            <h2 id="suggested-card-title">
              {card.weekLabel} · {card.picks.length + manualSelections.size} picks
            </h2>
            <p className="suggested-card-meta">
              {generated} · {card.strategyId}
            </p>
          </div>
          <div className="suggested-card-actions">
            <label>
              <span className="sr-only">Sort picks</span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as 'recommendation' | 'slate')
                }
              >
                <option value="recommendation">Recommendation</option>
                <option value="slate">Kickoff time</option>
              </select>
            </label>
            <button type="button" onClick={() => void copyCard()}>
              {copied ? 'Copied' : 'Copy card'}
            </button>
          </div>
        </div>

        <p className="suggested-card-note">{card.strategyNote}</p>

        <details className="suggested-card-scale">
          <summary>Grading scale</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col">Spread points</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {COMPOSITE_EDGE_SCALE.map((row) => (
                <tr key={row.factor}>
                  <th scope="row">{row.factor}</th>
                  <td>{row.value}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        {deviations.size > 0 && (
          <p className="suggested-card-kept">
            {deviations.size === 1
              ? '1 deviation from the last sent card is still marked.'
              : `${deviations.size} deviations from the last sent card are still marked.`}{' '}
            Uncheck one to use the recommended side the next time that game is
            sent.
          </p>
        )}

        <div className="card-send-selection">
          <div>
            <strong>
              {selectedCount}{' '}
              {selectedCount === 1 ? 'game' : 'games'} selected to send
            </strong>
            <small>
              Select all includes every recommendation and any manual pick
              with a side chosen.
            </small>
          </div>
          <div>
            <button type="button" onClick={selectAllForSend}>
              Select all
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setSelectedToSend(new Set())}
            >
              Deselect all
            </button>
          </div>
        </div>

        <div className="suggested-picks">
          {dayGroups.map((group) => (
            <section
              key={group.dateKey}
              className="suggested-pick-day"
              aria-labelledby={`card-day-${group.dateKey}`}
            >
              <div className="suggested-pick-day-heading">
                <h3 id={`card-day-${group.dateKey}`}>{group.label}</h3>
                <DaySendToggle
                  label={group.label}
                  dayIds={recommendedGameIdsForDay(group)}
                  selectedToSend={selectedToSend}
                  onToggle={toggleDaySend}
                />
              </div>
              <ol>
                {group.rows.map((row) =>
                  row.kind === 'pick' ? (
                    <SuggestedPickRow
                      key={row.pick.cbsEventId}
                      pick={row.pick}
                      deviate={deviations.has(row.pick.gameId)}
                      selectedToSend={selectedToSend.has(row.pick.gameId)}
                      poolProjection={poolProjections?.get(row.pick.cbsEventId)}
                      onToggleDeviate={toggleDeviate}
                      onToggleSend={toggleSend}
                    />
                  ) : (
                    <ManualReviewRow
                      key={row.game.cbsEventId}
                      game={row.game}
                      selected={manualSelections.get(row.game.gameId)}
                      selectedToSend={selectedToSend.has(row.game.gameId)}
                      poolProjection={poolProjections?.get(row.game.cbsEventId)}
                      onToggle={toggleManualPick}
                      onToggleSend={toggleSend}
                    />
                  ),
                )}
              </ol>
            </section>
          ))}
        </div>

        {card.tiebreaker && (
          <section className="card-tiebreaker" aria-labelledby="card-tiebreaker-title">
            <div>
              <p className="eyebrow">Weekly tiebreaker</p>
              <h3 id="card-tiebreaker-title">
                {card.tiebreaker.away} @ {card.tiebreaker.home}
              </h3>
              <p>{card.tiebreaker.question}</p>
              {card.tiebreaker.draftKingsTotal != null ? (
                <strong>
                  DraftKings O/U {card.tiebreaker.draftKingsTotal}
                </strong>
              ) : (
                <small>DraftKings total is not available yet.</small>
              )}
            </div>
            <label>
              <span>Total points</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder={
                  card.tiebreaker.draftKingsTotal != null
                    ? String(Math.round(card.tiebreaker.draftKingsTotal))
                    : 'Optional'
                }
                value={tiebreakerAnswer}
                onChange={(event) => {
                  setTiebreakerAnswer(event.target.value)
                  setTiebreakerError(null)
                }}
              />
            </label>
            {tiebreakerError && (
              <p className="error" role="alert">
                {tiebreakerError}
              </p>
            )}
          </section>
        )}

        <div className="complete-card">
          <button
            type="button"
            disabled={
              submitting ||
              selectedCount === 0
            }
            onClick={openPasswordPrompt}
          >
            {submitting ? 'Sending to GrokBot…' : 'Complete Card on CBS'}
          </button>
          <small>
            Sends {selectedCount} selected{' '}
            {selectedCount === 1 ? 'game' : 'games'} to GrokBot
            {selectedDeviationCount
              ? `, including ${selectedDeviationCount} deviation${selectedDeviationCount === 1 ? '' : 's'}`
              : ''}
            {selectedManualCount
              ? `, plus ${selectedManualCount} manual pick${selectedManualCount === 1 ? '' : 's'}`
              : ''}
            . You will confirm in chat before it is saved on CBS. Delivery runs in
            a GitHub Action, so check its run if GrokBot never posts the card.
          </small>
          {submitResult && (
            <p className={submitResult.kind} role="status">
              {submitResult.message}
            </p>
          )}
        </div>

        <a
          className="suggested-card-ride"
          href="https://giphy.com/gifs/nfl-russ-lets-ride-broncos-country-jYsoX0yaCMkppY7ihS"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src="https://media.giphy.com/media/jYsoX0yaCMkppY7ihS/giphy.gif"
            alt="Let's ride"
          />
        </a>
        </div>

        {askPassword && (
          <div
            className="card-password-overlay"
            onClick={() => setAskPassword(false)}
          >
            <form
              className="card-password"
              role="dialog"
              aria-modal="true"
              aria-labelledby="card-password-title"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => void completeCard(event)}
            >
              <h3 id="card-password-title">Enter password</h3>
              <p>
                Sends {selectedCount} {selectedCount === 1 ? 'pick' : 'picks'}
                {selectedDeviationCount
                  ? ` (${selectedDeviationCount} deviation${selectedDeviationCount === 1 ? '' : 's'})`
                  : ''}{' '}
                to GrokBot for {card.weekLabel}
                {selectedManualCount
                  ? `, including ${selectedManualCount} manual pick${selectedManualCount === 1 ? '' : 's'}`
                  : ''}
                {card.tiebreaker && readTiebreakerAnswer() != null
                  ? ` with a ${readTiebreakerAnswer()}-point tiebreaker`
                  : ''}
                . Nothing is saved on CBS until you confirm in chat.
              </p>
              <label>
                <span className="sr-only">Password</span>
                <input
                  ref={passwordRef}
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setPasswordError(null)
                  }}
                />
              </label>
              <div className="card-password-actions">
                <button type="button" onClick={() => setAskPassword(false)}>
                  Cancel
                </button>
                <button type="submit">Send card</button>
              </div>
              {passwordError && (
                <p className="error" role="alert">
                  {passwordError}
                </p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function DaySendToggle({
  label,
  dayIds,
  selectedToSend,
  onToggle,
}: {
  label: string
  dayIds: string[]
  selectedToSend: ReadonlySet<string>
  onToggle: (dayIds: string[], send: boolean) => void
}) {
  if (dayIds.length === 0) return null
  const state = daySendState(selectedToSend, dayIds)
  return (
    <label className="suggested-pick-toggle suggested-pick-day-send">
      <input
        type="checkbox"
        checked={state === 'all'}
        ref={(node) => {
          if (node) node.indeterminate = state === 'some'
        }}
        aria-label={`Send ${label} recommendations`}
        onChange={() => onToggle(dayIds, state !== 'all')}
      />
      Send
    </label>
  )
}

function SuggestedPickRow({
  pick,
  deviate,
  selectedToSend,
  poolProjection,
  onToggleDeviate,
  onToggleSend,
}: {
  pick: SuggestedPick
  deviate: boolean
  selectedToSend: boolean
  poolProjection?: PoolProjection
  onToggleDeviate: (gameId: string) => void
  onToggleSend: (gameId: string) => void
}) {
  const sent = submittedPick(pick, deviate)
  const kickoff = formatCardKickoff(pick.kickoff)
  const poolSupport = poolSupportView(
    poolProjection,
    sent.pickedSide,
    pick.homeAbbrev,
    pick.awayAbbrev,
  )
  return (
    <li
      className={[
        deviate ? 'deviated' : '',
        selectedToSend ? 'selected-to-send' : '',
      ].filter(Boolean).join(' ') || undefined}
    >
      <div className="suggested-pick-teams">
        <strong>
          {sent.pickedTeam} {formatPoolSpread(sent.poolSpread)}
        </strong>
        <span>
          {pick.away} @ {pick.home}
          {kickoff ? (
            <>
              {' · '}
              <time dateTime={pick.kickoff}>{kickoff}</time>
            </>
          ) : null}
          {deviate
            ? ` · rec was ${pick.pickedTeam} ${formatPoolSpread(pick.poolSpread)}`
            : ''}
        </span>
      </div>
      <div className="suggested-pick-tags">
        {pick.publicSupport !== 'none' ? (
          <span className={`pick-public ${pick.publicSupport}`}>
            {pick.publicSupport === 'agree'
              ? 'Public agrees'
              : 'Public fades'}
          </span>
        ) : null}
        <PoolSupportNote view={poolSupport} />
      </div>
      <div className="suggested-pick-controls">
        <label className="suggested-pick-toggle">
          <input
            type="checkbox"
            checked={selectedToSend}
            onChange={() => onToggleSend(pick.gameId)}
          />
          Send
        </label>
        <label className="suggested-pick-toggle">
          <input
            type="checkbox"
            checked={deviate}
            onChange={() => onToggleDeviate(pick.gameId)}
          />
          Deviate
        </label>
      </div>
      <em>{pick.detail}</em>
    </li>
  )
}

function ManualReviewRow({
  game,
  selected,
  selectedToSend,
  poolProjection,
  onToggle,
  onToggleSend,
}: {
  game: UnpickedGame
  selected: 'home' | 'away' | undefined
  selectedToSend: boolean
  poolProjection?: PoolProjection
  onToggle: (gameId: string, side: 'home' | 'away') => void
  onToggleSend: (gameId: string) => void
}) {
  const kickoff = formatCardKickoff(game.kickoff)
  const leanLabel =
    game.leanTeam && game.leanSpread != null
      ? `Lean ${game.leanTeam} ${formatPoolSpread(game.leanSpread)}`
      : null
  return (
    <li
      className={[
        'manual-review',
        selected ? 'manually-picked' : '',
        selectedToSend ? 'selected-to-send' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="suggested-pick-teams">
        <strong>
          {leanLabel ?? `${game.away} @ ${game.home}`}
        </strong>
        <span>
          {leanLabel ? `${game.away} @ ${game.home}` : null}
          {leanLabel && kickoff ? ' · ' : null}
          {kickoff ? <time dateTime={game.kickoff}>{kickoff}</time> : null}
        </span>
        {game.detail && <em>{game.detail}</em>}
        <span>{game.reason}</span>
      </div>
      <div className="suggested-pick-tags">
        <span className="pick-source manual-review">Manual review</span>
        <PoolSupportNote
          view={poolSupportView(
            poolProjection,
            selected,
            game.homeAbbrev,
            game.awayAbbrev,
          )}
        />
      </div>
      <label className="suggested-pick-toggle manual-send-toggle">
        <input
          type="checkbox"
          checked={selectedToSend && selected != null}
          disabled={!selected}
          onChange={() => onToggleSend(game.gameId)}
        />
        Send
      </label>
      <div className="manual-pick-options">
        {(['away', 'home'] as const).map((side) => {
          const team = side === 'away' ? game.away : game.home
          const spread = game.homeSpread * (side === 'away' ? -1 : 1)
          return (
            <label key={side}>
              <input
                type="checkbox"
                checked={selected === side}
                onChange={() => onToggle(game.gameId, side)}
              />
              <span>
                {team} {formatPoolSpread(spread)}
              </span>
            </label>
          )
        })}
      </div>
    </li>
  )
}
