import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  formatPoolSpread,
  formatSuggestedCardText,
  type SuggestedCard,
} from './cardStrategy'

export default function SuggestedCardPanel({
  card,
  onClose,
}: {
  card: SuggestedCard
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const generated = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(card.generatedAt))

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
      await navigator.clipboard.writeText(formatSuggestedCardText(card))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
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
            <button type="button" onClick={() => void copyCard()}>
              {copied ? 'Copied' : 'Copy card'}
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <ol className="suggested-picks">
          {card.picks.map((pick) => (
            <li key={pick.cbsEventId}>
              <div className="suggested-pick-teams">
                <strong>
                  {pick.pickedTeam} {formatPoolSpread(pick.poolSpread)}
                </strong>
                <span>
                  {pick.away} @ {pick.home}
                </span>
              </div>
              <span className={`pick-source ${pick.source}`}>
                {pick.source === 'line-value' ? 'Line value' : 'Public'}
              </span>
              <span className={`pick-strength ${pick.strength}`}>
                {pick.strength}
              </span>
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
      </div>
    </div>,
    document.body,
  )
}
