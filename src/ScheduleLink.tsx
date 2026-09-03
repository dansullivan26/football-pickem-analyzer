import { cbsScheduleUrl, type InjuryTeam } from './cbsInjuries'

export default function ScheduleLink({
  team,
  children,
  className = 'schedule-link',
}: {
  team: InjuryTeam
  children: string
  className?: string
}) {
  const href = cbsScheduleUrl(team)
  if (!href) return null
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`CBS schedule for ${children}`}
    >
      {children}
    </a>
  )
}
