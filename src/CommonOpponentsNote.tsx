import {
  formatCommonOpponentMeeting,
  type CommonOpponentsBreakdown,
} from './commonOpponents'
import {
  formatOffSlateMeeting,
  type OffSlateBreakdown,
} from './ncaafSchedule'

export const COMMON_OPPONENTS_TITLE =
  "Prior CBS pick'em appearances only. Informational — not in the recommendation."

export const OFF_SLATE_OPPONENTS_TITLE =
  'CollegeFootballData schedule, straight-up only — no CBS number. Informational — not in the recommendation.'

function AtsBlock({
  breakdown,
  className,
}: {
  breakdown: CommonOpponentsBreakdown
  className: string
}) {
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
          <span className="common-opponents-meeting">
            {formatCommonOpponentMeeting(group.away)}
          </span>
          <span className="common-opponents-meeting">
            {formatCommonOpponentMeeting(group.home)}
          </span>
        </span>
      ))}
    </div>
  )
}

function OffSlateBlock({
  breakdown,
  className,
}: {
  breakdown: OffSlateBreakdown
  className: string
}) {
  return (
    <div
      className={`${className} off-slate`}
      title={OFF_SLATE_OPPONENTS_TITLE}
    >
      <span className="common-opponents-heading">{breakdown.heading}</span>
      {breakdown.groups.map((group) => (
        <span
          className="common-opponents-row"
          key={`${group.kind}-${group.opponentKey}-${group.away.kickoff}-${group.home.kickoff}`}
        >
          <strong>
            {group.kind === 'head-to-head' ? 'Head-to-head' : group.opponentName}
          </strong>
          <span className="common-opponents-meeting">
            {formatOffSlateMeeting(group.away)}
          </span>
          <span className="common-opponents-meeting">
            {formatOffSlateMeeting(group.home)}
          </span>
        </span>
      ))}
    </div>
  )
}

export function CommonOpponentsNote({
  breakdown,
  offSlate = null,
  className = 'game-common-opponents',
}: {
  breakdown: CommonOpponentsBreakdown | null
  offSlate?: OffSlateBreakdown | null
  className?: string
}) {
  if (!breakdown && !offSlate) return null
  return (
    <>
      {breakdown ? (
        <AtsBlock breakdown={breakdown} className={className} />
      ) : null}
      {offSlate ? (
        <OffSlateBlock breakdown={offSlate} className={className} />
      ) : null}
    </>
  )
}
