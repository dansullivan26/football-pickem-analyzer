import { useEffect, useState } from 'react'
import { cbsTeamLogoUrl, darkBackdropForLogoUrl } from './teamLogos'
import type { Team } from './types'

/** Unknown team ids answer 200 with a generic 24x24 shield; real marks are 250x250. */
const PLACEHOLDER_SIZE = 24

export default function TeamLogo({ team }: { team: Pick<Team, 'id'> }) {
  const [hiddenSrc, setHiddenSrc] = useState<string | null>(null)
  const [onDark, setOnDark] = useState(false)
  const src = cbsTeamLogoUrl(team.id)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    void darkBackdropForLogoUrl(src).then((needsDark) => {
      if (!cancelled) setOnDark(needsDark)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  if (!src || src === hiddenSrc) return null

  return (
    <img
      className={onDark ? 'team-logo on-dark' : 'team-logo'}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setHiddenSrc(src)}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget
        if (
          naturalWidth === PLACEHOLDER_SIZE &&
          naturalHeight === PLACEHOLDER_SIZE
        ) {
          setHiddenSrc(src)
        }
      }}
    />
  )
}
