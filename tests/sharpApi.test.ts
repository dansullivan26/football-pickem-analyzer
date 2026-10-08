import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SHARP_ODDS_URL,
  SHARP_PAGE_LIMIT,
  sharpOddsUrl,
  sharpRetryDelayMs,
} from '../src/sharpApi.ts'

test('odds query asks SharpAPI for prematch main lines only', () => {
  const url = sharpOddsUrl({
    league: 'ncaaf',
    sportsbook: 'draftkings',
    market: 'point_spread',
  })

  assert.equal(url.origin + url.pathname, SHARP_ODDS_URL)
  assert.equal(url.searchParams.get('league'), 'ncaaf')
  assert.equal(url.searchParams.get('sportsbook'), 'draftkings')
  assert.equal(url.searchParams.get('market'), 'point_spread')
  assert.equal(url.searchParams.get('is_live'), 'false')
  assert.equal(url.searchParams.get('is_alternate_line'), 'false')
  assert.equal(url.searchParams.get('limit'), String(SHARP_PAGE_LIMIT))
  assert.equal(url.searchParams.get('event_id'), null)
  assert.equal(url.searchParams.get('cursor'), null)
})

test('odds query keeps the tiebreaker event and pagination cursor', () => {
  const url = sharpOddsUrl({
    league: 'nfl',
    sportsbook: 'draftkings',
    market: 'total_points',
    eventId: 'dk-123',
    cursor: 'abc',
  })

  assert.equal(url.searchParams.get('event_id'), 'dk-123')
  assert.equal(url.searchParams.get('cursor'), 'abc')
  assert.equal(url.searchParams.get('is_alternate_line'), 'false')
})

test('429 wait prefers retryAfter seconds and ignores a huge retry_after', () => {
  const now = Date.parse('2026-10-08T22:13:36Z')
  const wait = sharpRetryDelayMs(
    429,
    JSON.stringify({
      error: {
        code: 'rate_limited',
        retryAfter: 24,
        retry_after: 1791497640000,
        reset_at: '2026-10-08T22:14:00Z',
      },
    }),
    undefined,
    now,
  )

  assert.equal(wait, 24_000)
})

test('429 wait uses reset_at when retry fields are unusable', () => {
  const now = Date.parse('2026-10-08T16:38:33Z')
  const wait = sharpRetryDelayMs(
    429,
    JSON.stringify({
      error: {
        retry_after: 1791477540000,
        reset_at: '2026-10-08T16:39:00Z',
      },
    }),
    undefined,
    now,
  )

  assert.equal(wait, 27_000)
})

test('429 wait reads Retry-After when the body is not JSON', () => {
  const wait = sharpRetryDelayMs(429, 'rate limited', {
    get(name) {
      return name.toLowerCase() === 'retry-after' ? '15' : null
    },
  })

  assert.equal(wait, 15_000)
})

test('non-429 responses are not retried', () => {
  assert.equal(sharpRetryDelayMs(500, '{"error":{}}'), null)
})
