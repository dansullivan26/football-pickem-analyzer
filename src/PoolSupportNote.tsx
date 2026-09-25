import type { PoolSupportView } from './cardPoolAware'

export function PoolSupportNote({ view }: { view: PoolSupportView | null }) {
  if (!view) return null
  return (
    <div
      className={`pool-support ${view.stance} ${view.tier}`}
      title={view.title}
    >
      {view.line}
    </div>
  )
}
