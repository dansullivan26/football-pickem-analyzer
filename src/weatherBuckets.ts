export const WINDY_MPH = 15
export const WET_POP = 40
/** Outdoor kickoff heat that starts to change football. */
export const HOT_F = 85
/** Near-freezing: kicking and ball handling get worse. */
export const COLD_F = 35

export type WeatherBucket = 'benign' | 'adverse' | 'indoor'

export type FrozenWeather = {
  cbsEventId: number
  seasonYear: number
  week: number
  frozenAt: string
  kickoff: string
  indoor: boolean
  wet: boolean
  windy: boolean
  bucket: WeatherBucket
  temperature: number | null
  windSpeed: string | null
  shortForecast: string | null
  precipChance: number | null
}

export type WeatherHistoryFile = {
  updatedAt: string | null
  games: FrozenWeather[]
}

const WET_FORECAST = /rain|shower|thunder|storm|snow|sleet|drizzle|precip/i

export function parseWindMph(windSpeed: string) {
  const matches = [...windSpeed.matchAll(/(\d+(?:\.\d+)?)/g)].map((row) =>
    Number(row[1]),
  )
  if (matches.length === 0) return null
  return Math.max(...matches)
}

export function isWetForecast(
  shortForecast: string,
  precipChance: number | null,
) {
  if (typeof precipChance === 'number' && precipChance >= WET_POP) return true
  return WET_FORECAST.test(shortForecast)
}

export function isHotTemp(temperature: number | null | undefined) {
  return typeof temperature === 'number' && temperature >= HOT_F
}

export function isColdTemp(temperature: number | null | undefined) {
  return typeof temperature === 'number' && temperature <= COLD_F
}

export function classifyOutdoorWeather(input: {
  shortForecast: string
  windSpeed: string
  precipChance?: number | null
}) {
  const wet = isWetForecast(input.shortForecast, input.precipChance ?? null)
  const wind = parseWindMph(input.windSpeed)
  const windy = wind != null && wind >= WINDY_MPH
  return {
    wet,
    windy,
    bucket: (wet || windy ? 'adverse' : 'benign') as Exclude<
      WeatherBucket,
      'indoor'
    >,
  }
}

export function indoorWeatherSnapshot(
  game: Pick<FrozenWeather, 'cbsEventId' | 'seasonYear' | 'week' | 'kickoff'>,
  frozenAt = new Date().toISOString(),
): FrozenWeather {
  return {
    ...game,
    frozenAt,
    indoor: true,
    wet: false,
    windy: false,
    bucket: 'indoor',
    temperature: null,
    windSpeed: null,
    shortForecast: null,
    precipChance: null,
  }
}

export function weatherFromConditions(
  game: Pick<FrozenWeather, 'cbsEventId' | 'seasonYear' | 'week' | 'kickoff'>,
  conditions: {
    temperature: number
    windSpeed: string
    shortForecast: string
    precipChance?: number | null
  },
  frozenAt = new Date().toISOString(),
): FrozenWeather {
  const classified = classifyOutdoorWeather({
    shortForecast: conditions.shortForecast,
    windSpeed: conditions.windSpeed,
    precipChance: conditions.precipChance ?? null,
  })
  return {
    ...game,
    frozenAt,
    indoor: false,
    wet: classified.wet,
    windy: classified.windy,
    bucket: classified.bucket,
    temperature: conditions.temperature,
    windSpeed: conditions.windSpeed,
    shortForecast: conditions.shortForecast,
    precipChance: conditions.precipChance ?? null,
  }
}

export function formatWeatherBucket(weather: FrozenWeather | null) {
  if (!weather) return null
  if (weather.bucket === 'indoor') return 'Indoor'
  const flags = [
    weather.wet ? 'wet' : null,
    weather.windy ? 'wind' : null,
    isHotTemp(weather.temperature) ? 'hot' : null,
    isColdTemp(weather.temperature) ? 'cold' : null,
  ].filter(Boolean)
  if (weather.bucket === 'adverse') {
    return flags.length ? `Adverse · ${flags.join(' · ')}` : 'Adverse'
  }
  return flags.length ? `Benign · ${flags.join(' · ')}` : 'Benign'
}

export function upsertFrozenWeather(
  file: WeatherHistoryFile,
  next: FrozenWeather,
): WeatherHistoryFile {
  return {
    updatedAt: next.frozenAt,
    games: [
      ...file.games.filter((game) => game.cbsEventId !== next.cbsEventId),
      next,
    ].sort(
      (left, right) =>
        left.seasonYear - right.seasonYear ||
        left.week - right.week ||
        left.cbsEventId - right.cbsEventId,
    ),
  }
}
