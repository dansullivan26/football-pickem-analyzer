import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CARD_STRATEGY_NOTE,
  formatPoolSpread,
  formatSuggestedCardText,
  sortSuggestedPicks,
  type SuggestedCard,
} from './cardStrategy'
import { sendCardToGrokBot } from './completeCard'

export default function SuggestedCardPanel({
  card,
  onClose,
}: {
  card: SuggestedCard
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [sort, setSort] = useState<'strength' | 'slate'>('slate')
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
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

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(formatSuggestedCardText(card, picks))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function completeCard() {
    const confirmed = window.confirm(
      `Send ${card.picks.length} recommended picks to GrokBot for ${card.weekLabel}? ` +
        'This does not save them on CBS yet; GrokBot will ask you to confirm in chat.',
    )
    if (!confirmed) return

    setSubmitting(true)
    setSubmitResult(null)
    try {
      await sendCardToGrokBot(card)
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
        <div className="suggested-card-header">
          <div>
            <p className="eyebrow">Suggested card</p>
            <h2 id="suggested-card-title">
              {card.weekLabel} · {card.picks.length} picks
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
                  setSort(event.target.value as 'strength' | 'slate')
                }
              >
                <option value="slate">Kickoff time</option>
                <option value="strength">Strength</option>
              </select>
            </label>
            <button type="button" onClick={() => void copyCard()}>
              {copied ? 'Copied' : 'Copy card'}
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <p className="suggested-card-note">{CARD_STRATEGY_NOTE}</p>

        <div className="complete-card">
          <button
            type="button"
            disabled={submitting || card.picks.length === 0}
            onClick={() => void completeCard()}
          >
            {submitting ? 'Sending to GrokBot…' : 'Complete Card on CBS'}
          </button>
          <small>
            Sends this exact card to GrokBot. You will confirm in chat before it is
            saved on CBS. Delivery runs in a GitHub Action, so check its run if
            GrokBot never posts the card.
          </small>
          {submitResult && (
            <p className={submitResult.kind} role="status">
              {submitResult.message}
            </p>
          )}
        </div>

        <ol className="suggested-picks">
          {picks.map((pick) => (
            <li key={pick.cbsEventId}>
              <div className="suggested-pick-teams">
                <strong>
                  {pick.pickedTeam} {formatPoolSpread(pick.poolSpread)}
                </strong>
                <span>
                  {pick.away} @ {pick.home}
                </span>
              </div>
              <div className="suggested-pick-tags">
                <span className={`pick-source ${pick.source}`}>
                  {pick.source === 'line-value' ? 'Line value' : 'Public'}
                </span>
                <span className={`pick-strength ${pick.strength}`}>
                  {pick.strength}
                </span>
                {pick.hook && (
                  <span className="pick-hook">
                    {pick.hook === 'fg' ? 'FG hook' : 'TD hook'}
                  </span>
                )}
              </div>
              <em>{pick.detail}</em>
            </li>
          ))}
        </ol>

        {card.unpicked.length > 0 && (
          <div className="suggested-unpicked">
            <h3>Left unpicked ({card.unpicked.length})</h3>
            <ul>
              {card.unpicked.map((game) => (
                <li key={game.cbsEventId}>
                  <strong>
                    {game.away} @ {game.home}
                  </strong>
                  <span>{game.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
    </div>,
    document.body,
  )
}
