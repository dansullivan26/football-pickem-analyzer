import type { GameVenue, SlateGame } from './types'

export type WeatherChip =
  | { status: 'loading' }
  | { status: 'indoor' }
  | { status: 'unavailable' }
  | {
      status: 'ready'
      temperature: number
      unit: string
      shortForecast: string
      windSpeed: string
    }

export type HourlyPeriod = {
  startTime: string
  endTime: string
  temperature: number
  temperatureUnit: string
  windSpeed: string
  shortForecast: string
}

const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const POINTS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const STORAGE_KEY = 'pickem-nws-weather-v1'
const GAME_DAY_TTL_MS = 45 * 60 * 1000
const AHEAD_TTL_MS = 4 * 60 * 60 * 1000
const COVER_SLACK_MS = 90 * 60 * 1000

const USPS: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

type CacheFile = {
  geocode: Record<string, { lat: number; lon: number; fetchedAt: number }>
  points: Record<string, { hourlyUrl: string; fetchedAt: number }>
  chips: Record<string, { chip: WeatherChip; expiresAt: number }>
}

const inflight = new Map<string, Promise<unknown>>()
const hourlyMemory = new Map<
  string,
  { periods: HourlyPeriod[]; fetchedAt: number }
>()

function emptyCache(): CacheFile {
  return { geocode: {}, points: {}, chips: {} }
}

function readCache(): CacheFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyCache()
    const parsed = JSON.parse(raw) as CacheFile
    return {
      geocode: parsed.geocode ?? {},
      points: parsed.points ?? {},
      chips: parsed.chips ?? {},
    }
  } catch {
    return emptyCache()
  }
}

function writeCache(cache: CacheFile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Private mode or quota.
  }
}

function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const pending = run().finally(() => inflight.delete(key))
  inflight.set(key, pending)
  return pending
}

export function usStateName(state: string) {
  const trimmed = state.trim()
  if (!trimmed) return null
  const upper = trimmed.toUpperCase()
  if (USPS[upper]) return USPS[upper]
  const match = Object.values(USPS).find(
    (name) => name.toLowerCase() === trimmed.toLowerCase(),
  )
  return match ?? null
}

export function weatherCacheMs(kickoff: string, now: number) {
  const start = new Date(kickoff).getTime()
  if (Number.isNaN(start)) return AHEAD_TTL_MS
  const sameEtDay =
    etDayKey(kickoff) != null && etDayKey(kickoff) === etDayKey(new Date(now).toISOString())
  const withinDay = Math.abs(start - now) <= 24 * 60 * 60 * 1000
  return sameEtDay || withinDay ? GAME_DAY_TTL_MS : AHEAD_TTL_MS
}

function etDayKey(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso))
  } catch {
    return null
  }
}

export function hourlyPeriodForKickoff(
  periods: HourlyPeriod[],
  kickoff: string,
) {
  const at = new Date(kickoff).getTime()
  if (Number.isNaN(at) || periods.length === 0) return null
  const covering = periods.find((period) => {
    const start = new Date(period.startTime).getTime()
    const end = new Date(period.endTime).getTime()
    return start <= at && at < end
  })
  if (covering) return covering

  let nearest: HourlyPeriod | null = null
  let nearestGap = Infinity
  for (const period of periods) {
    const start = new Date(period.startTime).getTime()
    const gap = Math.abs(start - at)
    if (gap < nearestGap) {
      nearest = period
      nearestGap = gap
    }
  }
  return nearest && nearestGap <= COVER_SLACK_MS ? nearest : null
}

export function formatWeatherChip(chip: WeatherChip) {
  if (chip.status === 'loading') return 'Weather…'
  if (chip.status === 'indoor') return 'Indoor'
  if (chip.status === 'unavailable') return 'Weather unavailable'
  return `${chip.temperature}° · ${chip.shortForecast} · ${chip.windSpeed}`
}

export function venueQuery(venue: GameVenue | null | undefined) {
  const city = venue?.city?.trim() ?? ''
  const state = venue?.state?.trim() ?? ''
  if (!city || !state) return null
  const stateName = usStateName(state)
  if (!stateName) return null
  return { city, stateName, key: `${city}|${stateName}` }
}

export function weatherForVenueKind(venue: GameVenue | null | undefined) {
  if (venue?.indoor) return 'indoor' as const
  if (!venueQuery(venue)) return 'unavailable' as const
  return 'fetch' as const
}

function chipFromPeriod(period: HourlyPeriod): WeatherChip {
  return {
    status: 'ready',
    temperature: period.temperature,
    unit: period.temperatureUnit,
    shortForecast: period.shortForecast,
    windSpeed: period.windSpeed,
  }
}

async function geocodeCity(city: string, stateName: string) {
  const query = new URLSearchParams({
    name: `${city}, ${stateName}`,
    count: '1',
    country: 'US',
    language: 'en',
    format: 'json',
  })
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${query}`,
  )
  if (!response.ok) throw new Error(`Geocode failed (${response.status})`)
  const body = (await response.json()) as {
    results?: Array<{ latitude: number; longitude: number }>
  }
  const hit = body.results?.[0]
  if (!hit) throw new Error('Geocode missed.')
  return { lat: hit.latitude, lon: hit.longitude }
}

async function nwsHourlyUrl(lat: number, lon: number) {
  const response = await fetch(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
    { headers: { Accept: 'application/geo+json' } },
  )
  if (!response.ok) throw new Error(`NWS points failed (${response.status})`)
  const body = (await response.json()) as {
    properties?: { forecastHourly?: string }
  }
  const url = body.properties?.forecastHourly
  if (!url) throw new Error('NWS points had no hourly forecast.')
  return url
}

async function nwsHourlyPeriods(url: string) {
  const response = await fetch(url, {
    headers: { Accept: 'application/geo+json' },
  })
  if (!response.ok) throw new Error(`NWS hourly failed (${response.status})`)
  const body = (await response.json()) as {
    properties?: { periods?: HourlyPeriod[] }
  }
  return body.properties?.periods ?? []
}

export function peekWeatherChip(
  game: Pick<SlateGame, 'cbsEventId' | 'venue'>,
  now = Date.now(),
): WeatherChip {
  const kind = weatherForVenueKind(game.venue)
  if (kind !== 'fetch') return { status: kind }
  const cached = readCache().chips[String(game.cbsEventId)]
  if (cached && cached.expiresAt > now) return cached.chip
  return { status: 'loading' }
}

export async function weatherForGame(
  game: Pick<SlateGame, 'cbsEventId' | 'kickoff' | 'venue'>,
  now = Date.now(),
): Promise<WeatherChip> {
  const kind = weatherForVenueKind(game.venue)
  if (kind === 'indoor') return { status: 'indoor' }
  if (kind === 'unavailable') return { status: 'unavailable' }

  const query = venueQuery(game.venue)
  if (!query) return { status: 'unavailable' }

  const cache = readCache()
  const cachedChip = cache.chips[String(game.cbsEventId)]
  if (cachedChip && cachedChip.expiresAt > now) return cachedChip.chip

  try {
    const coords = await shared(`geo:${query.key}`, async () => {
      const stored = cache.geocode[query.key]
      if (stored && now - stored.fetchedAt < GEOCODE_TTL_MS) {
        return { lat: stored.lat, lon: stored.lon }
      }
      const next = await geocodeCity(query.city, query.stateName)
      cache.geocode[query.key] = { ...next, fetchedAt: now }
      writeCache(cache)
      return next
    })

    const pointKey = `${coords.lat.toFixed(3)},${coords.lon.toFixed(3)}`
    const hourlyUrl = await shared(`points:${pointKey}`, async () => {
      const stored = cache.points[pointKey]
      if (stored && now - stored.fetchedAt < POINTS_TTL_MS) {
        return stored.hourlyUrl
      }
      const url = await nwsHourlyUrl(coords.lat, coords.lon)
      cache.points[pointKey] = { hourlyUrl: url, fetchedAt: now }
      writeCache(cache)
      return url
    })

    const ttl = weatherCacheMs(game.kickoff, now)
    const periods = await shared(`hourly:${hourlyUrl}`, async () => {
      const remembered = hourlyMemory.get(hourlyUrl)
      if (remembered && now - remembered.fetchedAt < ttl) {
        return remembered.periods
      }
      const next = await nwsHourlyPeriods(hourlyUrl)
      hourlyMemory.set(hourlyUrl, { periods: next, fetchedAt: now })
      return next
    })

    const period = hourlyPeriodForKickoff(periods, game.kickoff)
    const chip = period ? chipFromPeriod(period) : { status: 'unavailable' as const }
    cache.chips[String(game.cbsEventId)] = { chip, expiresAt: now + ttl }
    writeCache(cache)
    return chip
  } catch {
    return { status: 'unavailable' }
  }
}
