import { useState } from 'react'
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
  const generated = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(card.generatedAt))

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(formatSuggestedCardText(card))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="suggested-card" aria-label="Suggested slate card">
      <div className="suggested-card-header">
        <div>
          <p className="eyebrow">Suggested card</p>
          <h2>
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
    </section>
  )
}
