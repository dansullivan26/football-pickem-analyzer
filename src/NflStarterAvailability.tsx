import InjuryLink from './InjuryLink'
import {
  formatInjuryLineEvent,
  type InjuryLineEvent,
} from './injuryLineMoves'
import {
  formatInjuryPulledAt,
  NFL_AVAILABILITY_LABELS,
  NFL_AVAILABILITY_ORDER,
  type NflStarterInjuryFile,
  type NflStarterInjuryTeam,
} from './nflStarterInjuries'
import type { Team } from './types'

function TeamAvailability({
  team,
  report,
}: {
  team: Team
  report: NflStarterInjuryTeam | undefined
}) {
  return (
    <section className="starter-availability-team">
      <h4>{team.name}</h4>
      {!report || report.status === 'unavailable' ? (
        <p className="starter-availability-empty">
          ESPN depth chart unavailable.
        </p>
      ) : report.injuries.length === 0 ? (
        <p className="starter-availability-empty">
          No reported first-team injuries.
        </p>
      ) : (
        NFL_AVAILABILITY_ORDER.map((tier) => {
          const injuries = report.injuries.filter(
            (injury) => injury.tier === tier,
          )
          if (injuries.length === 0) return null
          return (
            <div className={`starter-status ${tier}`} key={tier}>
              <h5>{NFL_AVAILABILITY_LABELS[tier]}</h5>
              <ul>
                {injuries.map((injury) => (
                  <li key={`${injury.athleteId ?? injury.name}:${injury.status}`}>
                    <div>
                      <strong>{injury.name}</strong>
                      <span>
                        {team.abbrev} · {injury.position}
                        {injury.injury ? ` · ${injury.injury}` : ''}
                      </span>
                    </div>
                    <small>{injury.status}</small>
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}
    </section>
  )
}

export default function NflStarterAvailability({
  away,
  home,
  file,
  lineEvents,
}: {
  away: Team
  home: Team
  file: NflStarterInjuryFile
  lineEvents: InjuryLineEvent[]
}) {
  const reports = new Map(file.teams.map((team) => [team.abbrev, team]))
  const awayReport = reports.get(away.abbrev)
  const homeReport = reports.get(home.abbrev)
  const count =
    (awayReport?.injuries.length ?? 0) + (homeReport?.injuries.length ?? 0)
  const pulledAt = formatInjuryPulledAt(file.source.fetchedAt)
  const coincidences = lineEvents.filter(
    (event) => event.towardTeam != null && event.towardTeam !== 0,
  )
  const orderedEvents = [...lineEvents].sort((left, right) => {
    const leftMove = Math.abs(left.towardTeam ?? 0)
    const rightMove = Math.abs(right.towardTeam ?? 0)
    if (rightMove !== leftMove) return rightMove - leftMove
    return right.at.localeCompare(left.at)
  })

  return (
    <details className="starter-availability">
      <summary>
        <span>
          Starter availability
          <strong>{count ? `${count} listed` : 'None listed'}</strong>
          {coincidences.length > 0 && (
            <strong className="injury-line-tag">
              {coincidences.length === 1
                ? '1 DK coincidence'
                : `${coincidences.length} DK coincidences`}
            </strong>
          )}
        </span>
        <small>ESPN · pulled {pulledAt}</small>
      </summary>
      <p className="starter-availability-note">{file.source.note}</p>
      {orderedEvents.length > 0 && (
        <div className="injury-line-moves">
          <h4>Same-hour DraftKings</h4>
          <p>
            Status tier changes vs the last ESPN snapshot, next to the
            DraftKings home spread from that same hourly pull. Coincidence,
            not a causal claim.
          </p>
          <ul>
            {orderedEvents.map((event) => (
              <li key={`${event.athleteId ?? event.name}:${event.at}:${event.toStatus}`}>
                <span>{formatInjuryLineEvent(event)}</span>
                <small>{formatInjuryPulledAt(event.at)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="starter-availability-grid">
        <TeamAvailability team={away} report={awayReport} />
        <TeamAvailability team={home} report={homeReport} />
      </div>
      <div className="starter-availability-links">
        Verify full CBS reports:
        <InjuryLink team={{ sport: 'NFL', ...away }}>
          {away.name}
        </InjuryLink>
        <span aria-hidden="true">·</span>
        <InjuryLink team={{ sport: 'NFL', ...home }}>
          {home.name}
        </InjuryLink>
      </div>
    </details>
  )
}
