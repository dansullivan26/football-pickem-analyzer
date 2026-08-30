export type AppView = 'lines' | 'players' | 'teams' | 'performance' | 'bad-beats'

export type AppLocation = {
  view: AppView
  teamSlug: string | null
}

const VIEW_PATHS: Record<AppView, string> = {
  lines: '/',
  players: '/players',
  teams: '/teams',
  performance: '/performance',
  'bad-beats': '/bad-beats',
}

export function basePath() {
  const raw =
    typeof import.meta.env?.BASE_URL === 'string'
      ? import.meta.env.BASE_URL
      : '/'
  return raw.replace(/\/$/, '')
}

export function pathForView(view: AppView, teamSlug?: string | null) {
  const suffix =
    view === 'teams' && teamSlug ? `/teams/${teamSlug}` : VIEW_PATHS[view]
  return `${basePath()}${suffix === '/' ? '/' : suffix}`
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
  if (clean === '/players') return { view: 'players', teamSlug: null }
  if (clean === '/performance') return { view: 'performance', teamSlug: null }
  if (clean === '/bad-beats') return { view: 'bad-beats', teamSlug: null }
  if (clean === '/teams') return { view: 'teams', teamSlug: null }
  if (clean.startsWith('/teams/')) {
    const slug = clean.slice('/teams/'.length).split('/').filter(Boolean)[0]
    return { view: 'teams', teamSlug: slug ?? null }
  }
  return { view: 'lines', teamSlug: null }
}

export function viewFromPath(
  pathname?: string,
  base?: string,
): AppView {
  return locationFromPath(pathname, base).view
}
