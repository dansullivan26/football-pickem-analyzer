import {
  formatCommonOpponentMeeting,
  type CommonOpponentsBreakdown,
} from './commonOpponents'

export const COMMON_OPPONENTS_TITLE =
  "Prior CBS pick'em appearances only. Informational — not in the recommendation."

export function CommonOpponentsNote({
  breakdown,
  className = 'game-common-opponents',
}: {
  breakdown: CommonOpponentsBreakdown | null
  className?: string
}) {
  if (!breakdown) return null
  return (
    <div className={className} title={COMMON_OPPONENTS_TITLE}>
      <span className="common-opponents-heading">{breakdown.heading}</span>
      {breakdown.groups.map((group) => (
        <span
          className="common-opponents-row"
          key={`${group.kind}-${group.opponentAbbrev}-${group.away.cbsEventId}-${group.home.cbsEventId}`}
        >
          <strong>
            {group.kind === 'head-to-head' ? 'Head-to-head' : group.opponentName}
          </strong>
          {' · '}
          {formatCommonOpponentMeeting(group.away)}
          {' · '}
          {formatCommonOpponentMeeting(group.home)}
        </span>
      ))}
    </div>
  )
}
