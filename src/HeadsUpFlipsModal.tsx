import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatCardKickoff } from './cardStrategy'
import type { SentRecommendationFlip } from './sentRecFlips'

export default function HeadsUpFlipsModal({
  weekLabel,
  flips,
  onDismiss,
}: {
  weekLabel: string
  flips: SentRecommendationFlip[]
  onDismiss: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

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
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  return createPortal(
    <div className="suggested-card-overlay heads-up-overlay" onClick={onDismiss}>
      <div
        ref={dialogRef}
        className="suggested-card heads-up-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="heads-up-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="suggested-card-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
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
          <p className="eyebrow">Heads up</p>
          <h2 id="heads-up-title">
            {flips.length === 1
              ? '1 sent pick no longer matches the card'
              : `${flips.length} sent picks no longer match the card`}
          </h2>
          <p className="suggested-card-note">
            You already sent these {weekLabel} games to CBS. The live
            recommendation now likes the other side. Nothing has been changed
            on CBS.
          </p>
          <ol className="heads-up-list">
            {flips.map((flip) => {
              const kickoff = formatCardKickoff(flip.kickoff)
              return (
                <li key={flip.gameId}>
                  <strong>
                    {flip.away} @ {flip.home}
                  </strong>
                  {kickoff ? (
                    <span>
                      <time dateTime={flip.kickoff}>{kickoff}</time>
                    </span>
                  ) : null}
                  <span>Sent {flip.sentLine}</span>
                  <span>Now {flip.nowLine}</span>
                </li>
              )
            })}
          </ol>
          <div className="heads-up-actions">
            <button type="button" onClick={onDismiss}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
