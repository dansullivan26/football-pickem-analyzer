import { mergeCareerHistory } from './careerHistory'
import type { PlayerHistory } from './types'

const archiveModules = import.meta.glob<{ default: PlayerHistory }>(
  './data/player-seasons/*.json',
  { eager: true },
)

export function archivedPlayerSeasons(): PlayerHistory[] {
  return Object.values(archiveModules).map((mod) => mod.default)
}

export function careerPlayerHistory(current: PlayerHistory): PlayerHistory {
  return mergeCareerHistory(current, archivedPlayerSeasons())
}
