export const SHARP_ODDS_URL = 'https://api.sharpapi.io/api/v1/odds'
export const SHARP_PAGE_LIMIT = 200
export const SHARP_MAX_429_RETRIES = 3
const DEFAULT_RETRY_MS = 30_000
const MAX_RETRY_MS = 90_000

export type SharpOddsQuery = {
  league: string
  sportsbook: string
  market: string
  isLive?: boolean
  eventId?: string
  cursor?: string
}

/**
 * Free-tier snapshot. Alternate ladders are omitted at the API so one
 * refresh stays near 2–3 calls instead of paging through every extra number.
 * `is_alternate_line=false` still includes cohort-pending mains.
 */
export function sharpOddsUrl(query: SharpOddsQuery) {
  const url = new URL(SHARP_ODDS_URL)
  url.searchParams.set('league', query.league)
  url.searchParams.set('sportsbook', query.sportsbook)
  url.searchParams.set('market', query.market)
  url.searchParams.set('is_live', query.isLive === true ? 'true' : 'false')
  url.searchParams.set('is_alternate_line', 'false')
  url.searchParams.set('limit', String(SHARP_PAGE_LIMIT))
  if (query.eventId) url.searchParams.set('event_id', query.eventId)
  if (query.cursor) url.searchParams.set('cursor', query.cursor)
  return url
}

function saneDelaySeconds(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 1 || value > 120) return null
  return Math.ceil(value)
}

/**
 * Wait for a SharpAPI 429. Prefers `retryAfter` / `Retry-After` when they
 * look like seconds; ignores the huge `retry_after` timestamps they have
 * been emitting. Falls back to `reset_at`, then 30s. Null if not a 429.
 */
type SharpRateLimitBody = {
  error?: {
    retryAfter?: unknown
    retry_after?: unknown
    reset_at?: unknown
  }
}

export function sharpRetryDelayMs(
  status: number,
  bodyText: string,
  headers?: { get(name: string): string | null },
  now = Date.now(),
): number | null {
  if (status !== 429) return null

  let parsed: SharpRateLimitBody | null = null
  try {
    parsed = JSON.parse(bodyText) as SharpRateLimitBody
  } catch {
    parsed = null
  }

  const header = headers?.get('retry-after')
  const headerSec =
    header && /^\d+(\.\d+)?$/.test(header.trim()) ? Number(header) : null

  const fromBody =
    saneDelaySeconds(parsed?.error?.retryAfter) ??
    saneDelaySeconds(parsed?.error?.retry_after)
  const fromHeader = saneDelaySeconds(headerSec)
  const resetAt = parsed?.error?.reset_at
  const resetSec =
    typeof resetAt === 'string' && !Number.isNaN(Date.parse(resetAt))
      ? Math.max(1, Math.ceil((Date.parse(resetAt) - now) / 1000))
      : null
  const fromReset =
    resetSec != null && resetSec <= 120 ? resetSec : null

  const seconds = fromBody ?? fromHeader ?? fromReset ?? DEFAULT_RETRY_MS / 1000
  return Math.min(seconds * 1000, MAX_RETRY_MS)
}
