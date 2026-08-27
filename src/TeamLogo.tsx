import { useState } from 'react'
import { cbsTeamLogoUrl } from './teamLogos'
import type { Team } from './types'

/** Unknown team ids answer 200 with a generic 24x24 shield; real marks are 250x250. */
const PLACEHOLDER_SIZE = 24

export default function TeamLogo({ team }: { team: Team }) {
  const [hiddenSrc, setHiddenSrc] = useState<string | null>(null)
  const src = cbsTeamLogoUrl(team.id)

  if (!src || src === hiddenSrc) return null

  return (
    <img
      className="team-logo"
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
