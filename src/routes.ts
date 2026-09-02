export type AppView = 'lines' | 'players' | 'teams' | 'performance' | 'bad-beats'

export type AppLocation = {
  view: AppView
  teamSlug: string | null
  playerSlug: string | null
}

const VIEW_PATHS: Record<AppView, string> = {
  lines: '/',
  players: '/players',
  teams: '/teams',
  performance: '/performance',
  'bad-beats': '/bad-beats',
}

function at(
  view: AppView,
  extras: Partial<Pick<AppLocation, 'teamSlug' | 'playerSlug'>> = {},
): AppLocation {
  return { view, teamSlug: null, playerSlug: null, ...extras }
}

export function basePath() {
  const raw =
    typeof import.meta.env?.BASE_URL === 'string'
      ? import.meta.env.BASE_URL
      : '/'
  return raw.replace(/\/$/, '')
}

export function pathForView(view: AppView, slug?: string | null) {
  const suffix =
    view === 'teams' && slug
      ? `/teams/${slug}`
      : view === 'players' && slug
        ? `/players/${slug}`
        : VIEW_PATHS[view]
  return `${basePath()}${suffix === '/' ? '/' : suffix}`
}

export const TEAM_PROFILE_HASH = 'team-profile'

export function pathForTeam(teamSlug: string) {
  return `${pathForView('teams', teamSlug)}#${TEAM_PROFILE_HASH}`
}

export function pathForPlayer(playerSlug: string) {
  return pathForView('players', playerSlug)
}

export function pathForBadBeat(seasonYear: number, cbsEventId: number) {
  return `${pathForView('bad-beats')}#bad-beat-${seasonYear}-${cbsEventId}`
}

export function locationFromPath(
  pathname =
    typeof window !== 'undefined' ? window.location.pathname : '/',
  base = basePath(),
): AppLocation {
  const rest = pathname.startsWith(base)
    ? pathname.slice(base.length)
    : pathname
  const clean = rest.replace(/\/$/, '') || '/'
  if (clean === '/players') return at('players')
  if (clean.startsWith('/players/')) {
    const slug = clean.slice('/players/'.length).split('/').filter(Boolean)[0]
    return at('players', { playerSlug: slug ?? null })
  }
  if (clean === '/performance') return at('performance')
  if (clean === '/bad-beats') return at('bad-beats')
  if (clean === '/teams') return at('teams')
  if (clean.startsWith('/teams/')) {
    const slug = clean.slice('/teams/'.length).split('/').filter(Boolean)[0]
    return at('teams', { teamSlug: slug ?? null })
  }
  return at('lines')
}

export function viewFromPath(
  pathname?: string,
  base?: string,
): AppView {
  return locationFromPath(pathname, base).view
}
