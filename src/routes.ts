export type AppView = 'lines' | 'players' | 'performance'

const ROUTES: Record<AppView, string> = {
  lines: '/',
  players: '/players',
  performance: '/performance',
}

function basePath() {
  return import.meta.env.BASE_URL.replace(/\/$/, '')
}

export function pathForView(view: AppView) {
  const suffix = ROUTES[view]
  return `${basePath()}${suffix === '/' ? '/' : suffix}`
}

export function viewFromPath(pathname = window.location.pathname): AppView {
  const rest = pathname.startsWith(basePath())
    ? pathname.slice(basePath().length)
    : pathname
  const clean = rest.replace(/\/$/, '') || '/'
  if (clean === '/players') return 'players'
  if (clean === '/performance') return 'performance'
  return 'lines'
}
