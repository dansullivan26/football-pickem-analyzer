import type { ReactNode } from 'react'

export function AtsChip({
  mark,
  label,
  state,
  extra,
}: {
  mark: string | null
  label: string | null
  state: string
  extra?: ReactNode
}) {
  if (!mark && !label && !extra) return null
  return (
    <span
      className={`pick-result${mark ? ' ats-mark' : ''} ${state}`}
      title={label ?? undefined}
      aria-label={label ?? undefined}
    >
      {mark ?? label}
      {extra}
    </span>
  )
}
