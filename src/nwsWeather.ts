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
  precipChance?: number | null
}

const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const POINTS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const STORAGE_KEY = 'pickem-nws-weather-v2'
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

function nwsHeaders() {
  const headers: Record<string, string> = { Accept: 'application/geo+json' }
  if (typeof window === 'undefined') {
    headers['User-Agent'] =
      'pickem-edge (https://github.com/dansullivan26/football-pickem-analyzer)'
  }
  return headers
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
    { headers: nwsHeaders() },
  )
  if (!response.ok) throw new Error(`NWS points failed (${response.status})`)
  const body = (await response.json()) as {
    properties?: { forecastHourly?: string }
  }
  const url = body.properties?.forecastHourly
  if (!url) throw new Error('NWS points had no hourly forecast.')
  return url
}

export function wmoShortForecast(code: number) {
  if (code === 0) return 'Clear'
  if (code === 1) return 'Mostly Clear'
  if (code === 2) return 'Partly Cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain Showers'
  if (code >= 85 && code <= 86) return 'Snow Showers'
  if (code >= 95) return 'Thunderstorms'
  return 'Cloudy'
}

export function periodsFromOpenMeteoHourly(hourly: {
  time: number[]
  temperature_2m: Array<number | null>
  weather_code: Array<number | null>
  wind_speed_10m: Array<number | null>
  precipitation_probability?: Array<number | null>
}): HourlyPeriod[] {
  return hourly.time.flatMap((start, index) => {
    const temperature = hourly.temperature_2m[index]
    const code = hourly.weather_code[index]
    const wind = hourly.wind_speed_10m[index]
    if (temperature == null || code == null || wind == null) return []
    const startMs = start * 1000
    const pop = hourly.precipitation_probability?.[index]
    return [
      {
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(startMs + 60 * 60 * 1000).toISOString(),
        temperature: Math.round(temperature),
        temperatureUnit: 'F',
        windSpeed: `${Math.round(wind)} mph`,
        shortForecast: wmoShortForecast(code),
        precipChance: typeof pop === 'number' ? pop : null,
      },
    ]
  })
}

async function openMeteoHourlyPeriods(lat: number, lon: number) {
  const query = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly:
      'temperature_2m,weather_code,wind_speed_10m,precipitation_probability',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timeformat: 'unixtime',
    forecast_days: '16',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`)
  if (!response.ok) throw new Error(`Open-Meteo failed (${response.status})`)
  const body = (await response.json()) as {
    hourly?: {
      time: number[]
      temperature_2m: Array<number | null>
      weather_code: Array<number | null>
      wind_speed_10m: Array<number | null>
      precipitation_probability?: Array<number | null>
    }
  }
  if (!body.hourly?.time?.length) throw new Error('Open-Meteo had no hourly rows.')
  return periodsFromOpenMeteoHourly(body.hourly)
}

async function nwsHourlyPeriods(url: string) {
  const response = await fetch(url, { headers: nwsHeaders() })
  if (!response.ok) throw new Error(`NWS hourly failed (${response.status})`)
  const body = (await response.json()) as {
    properties?: {
      periods?: Array<
        HourlyPeriod & {
          probabilityOfPrecipitation?: { value?: number | null }
        }
      >
    }
  }
  return (body.properties?.periods ?? []).map((period) => ({
    startTime: period.startTime,
    endTime: period.endTime,
    temperature: period.temperature,
    temperatureUnit: period.temperatureUnit,
    windSpeed: period.windSpeed,
    shortForecast: period.shortForecast,
    precipChance:
      typeof period.probabilityOfPrecipitation?.value === 'number'
        ? period.probabilityOfPrecipitation.value
        : (period.precipChance ?? null),
  }))
}

async function periodForKickoff(
  kickoff: string,
  loadNws: () => Promise<HourlyPeriod[]>,
  loadOpenMeteo: () => Promise<HourlyPeriod[]>,
) {
  try {
    const covering = hourlyPeriodForKickoff(await loadNws(), kickoff)
    if (covering) return covering
  } catch {
    // NWS hourly is only ~6.5 days; later kickoffs use Open-Meteo.
  }
  return hourlyPeriodForKickoff(await loadOpenMeteo(), kickoff)
}

export async function loadHourlyPeriod(
  venue: GameVenue,
  kickoff: string,
) {
  const query = venueQuery(venue)
  if (!query) return null
  const coords = await geocodeCity(query.city, query.stateName)
  return periodForKickoff(
    kickoff,
    async () => nwsHourlyPeriods(await nwsHourlyUrl(coords.lat, coords.lon)),
    () => openMeteoHourlyPeriods(coords.lat, coords.lon),
  )
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
    const ttl = weatherCacheMs(game.kickoff, now)
    const period = await periodForKickoff(
      game.kickoff,
      async () => {
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
        return shared(`hourly:${hourlyUrl}`, async () => {
          const remembered = hourlyMemory.get(hourlyUrl)
          if (remembered && now - remembered.fetchedAt < ttl) {
            return remembered.periods
          }
          const next = await nwsHourlyPeriods(hourlyUrl)
          hourlyMemory.set(hourlyUrl, { periods: next, fetchedAt: now })
          return next
        })
      },
      () =>
        shared(`open-meteo:${pointKey}`, async () => {
          const remembered = hourlyMemory.get(`om:${pointKey}`)
          if (remembered && now - remembered.fetchedAt < ttl) {
            return remembered.periods
          }
          const next = await openMeteoHourlyPeriods(coords.lat, coords.lon)
          hourlyMemory.set(`om:${pointKey}`, { periods: next, fetchedAt: now })
          return next
        }),
    )

    if (!period) return { status: 'unavailable' }
    const chip = chipFromPeriod(period)
    cache.chips[String(game.cbsEventId)] = { chip, expiresAt: now + ttl }
    writeCache(cache)
    return chip
  } catch {
    return { status: 'unavailable' }
  }
}
