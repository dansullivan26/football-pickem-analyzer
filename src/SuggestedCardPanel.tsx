import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  CARD_STRATEGY_NOTE,
  formatPoolSpread,
  formatSuggestedCardText,
  sortSuggestedPicks,
  submittedPick,
  type SuggestedCard,
} from './cardStrategy'
import { rememberedDeviationIds, storeDeviationIds } from './cardOverrides'
import { unfavorableHook } from './cardScoring'
import { completeCardPasswordMatches, sendCardToGrokBot } from './completeCard'

export default function SuggestedCardPanel({
  card,
  savedDeviationIds = [],
  onClose,
}: {
  card: SuggestedCard
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

  function toggleManualPick(gameId: string, side: 'home' | 'away') {
    setManualSelections((current) => {
      const next = new Map(current)
      if (next.get(gameId) === side) next.delete(gameId)
      else next.set(gameId, side)
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
            <p className="eyebrow">Suggested card</p>
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

        <p className="suggested-card-note">{CARD_STRATEGY_NOTE}</p>
        {deviations.size > 0 && (
          <p className="suggested-card-kept">
            {deviations.size === 1
              ? '1 deviation from the last sent card is still marked.'
              : `${deviations.size} deviations from the last sent card are still marked.`}{' '}
            Uncheck one to send the recommended side this time.
          </p>
        )}

        <ol className="suggested-picks">
          {picks.map((pick) => {
            const deviate = deviations.has(pick.gameId)
            const sent = submittedPick(pick, deviate)
            const badHook = pick.hook ? null : unfavorableHook(pick.poolSpread)
            return (
              <li key={pick.cbsEventId} className={deviate ? 'deviated' : undefined}>
                <div className="suggested-pick-teams">
                  <strong>
                    {sent.pickedTeam} {formatPoolSpread(sent.poolSpread)}
                  </strong>
                  <span>
                    {pick.away} @ {pick.home}
                    {deviate
                      ? ` · rec was ${pick.pickedTeam} ${formatPoolSpread(pick.poolSpread)}`
                      : ''}
                  </span>
                </div>
                <div className="suggested-pick-tags">
                  <span className={`pick-source ${pick.source}`}>
                    {pick.source === 'line-value'
                      ? 'Line value'
                      : pick.source === 'rest-travel'
                        ? 'Rest / travel'
                        : 'Public'}
                  </span>
                  <span className={`pick-strength ${pick.strength}`}>
                    {pick.strength}
                  </span>
                  {pick.hook && (
                    <span className="pick-hook">
                      {pick.hook === 'fg' ? 'FG hook' : 'TD hook'}
                    </span>
                  )}
                  {badHook && (
                    <span className="pick-hook unfavorable">
                      Unfavorable {badHook === 'fg' ? 'FG' : 'TD'} hook
                    </span>
                  )}
                  {pick.publicSupport !== 'none' && (
                      <span className={`pick-public ${pick.publicSupport}`}>
                        {pick.publicSupport === 'agree'
                          ? 'Public agrees'
                          : 'Public fades'}
                      </span>
                    )}
                  {deviate && <span className="pick-deviate">Deviate</span>}
                </div>
                <label className="suggested-pick-toggle">
                  <input
                    type="checkbox"
                    checked={deviate}
                    onChange={() => toggleDeviate(pick.gameId)}
                  />
                  Deviate
                </label>
                <em>{pick.detail}</em>
              </li>
            )
          })}
        </ol>

        {card.unpicked.length > 0 && (
          <div className="suggested-unpicked">
            <h3>Manual review ({card.unpicked.length})</h3>
            <ul>
              {card.unpicked.map((game) => {
                const selected = manualSelections.get(game.gameId)
                return (
                <li
                  key={game.cbsEventId}
                  className={selected ? 'manually-picked' : undefined}
                >
                  <strong>
                    {game.away} @ {game.home}
                  </strong>
                  <span>{game.reason}</span>
                  <div className="manual-pick-options">
                    {(['away', 'home'] as const).map((side) => {
                      const team = side === 'away' ? game.away : game.home
                      const spread =
                        game.homeSpread * (side === 'away' ? -1 : 1)
                      return (
                        <label key={side}>
                          <input
                            type="checkbox"
                            checked={selected === side}
                            onChange={() => toggleManualPick(game.gameId, side)}
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
              })}
            </ul>
          </div>
        )}

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
              card.picks.length + manualSelections.size === 0
            }
            onClick={openPasswordPrompt}
          >
            {submitting ? 'Sending to GrokBot…' : 'Complete Card on CBS'}
          </button>
          <small>
            Sends this exact card to GrokBot
            {deviations.size
              ? `, including ${deviations.size} deviation${deviations.size === 1 ? '' : 's'}`
              : ''}
            {manualSelections.size
              ? `, plus ${manualSelections.size} manual pick${manualSelections.size === 1 ? '' : 's'}`
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
                Sends {card.picks.length + manualSelections.size} picks
                {deviations.size
                  ? ` (${deviations.size} deviation${deviations.size === 1 ? '' : 's'})`
                  : ''}{' '}
                to GrokBot for {card.weekLabel}
                {manualSelections.size
                  ? `, including ${manualSelections.size} manual pick${manualSelections.size === 1 ? '' : 's'}`
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
