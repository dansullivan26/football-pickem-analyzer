import { cbsInjuryUrl, type InjuryTeam } from './cbsInjuries'

export default function InjuryLink({
  team,
  children,
  className = 'injury-link',
}: {
  team: InjuryTeam
  children: string
  className?: string
}) {
  const href = cbsInjuryUrl(team)
  if (!href) return null
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`CBS injury report for ${children}`}
    >
      {children}
    </a>
  )
}
