import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { loadHourlyPeriod } from '../src/nwsWeather.ts'
import {
  indoorWeatherSnapshot,
  upsertFrozenWeather,
  weatherFromConditions,
  type FrozenWeather,
  type WeatherHistoryFile,
} from '../src/weatherBuckets.ts'
import type { Slate } from '../src/types.ts'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/weather-history.json', ROOT)
const RETRY_AFTER_KICKOFF_MS = 36 * 60 * 60 * 1000

const slate = JSON.parse(
  await readFile(new URL('src/data/current-slate.json', ROOT), 'utf8'),
) as Slate

let file: WeatherHistoryFile = { updatedAt: null, games: [] }
try {
  file = JSON.parse(await readFile(OUTPUT, 'utf8')) as WeatherHistoryFile
  file = {
    updatedAt: file.updatedAt ?? null,
    games: Array.isArray(file.games) ? file.games : [],
  }
} catch {
  // First freeze.
}

const now = Date.now()
const seasonYear = slate.pool.seasonYear
const byEvent = new Map(file.games.map((game) => [game.cbsEventId, game]))
let wrote = 0
let skipped = 0

for (const game of slate.games) {
  const existing = byEvent.get(game.cbsEventId)
  const kickoffMs = new Date(game.kickoff).getTime()
  const kickedOff = kickoffMs <= now

  if (kickedOff && existing) {
    skipped += 1
    continue
  }

  const base = {
    cbsEventId: game.cbsEventId,
    seasonYear,
    week: slate.week.order,
    kickoff: game.kickoff,
  }

  let next: FrozenWeather | null = null
  if (game.venue?.indoor) {
    next = indoorWeatherSnapshot(base)
  } else {
    try {
      const period = game.venue
        ? await loadHourlyPeriod(game.venue, game.kickoff)
        : null
      if (period) {
        next = weatherFromConditions(base, {
          temperature: period.temperature,
          windSpeed: period.windSpeed,
          shortForecast: period.shortForecast,
          precipChance: period.precipChance ?? null,
        })
      }
    } catch (error) {
      console.warn(
        `Weather freeze missed ${game.away.abbrev} @ ${game.home.abbrev}:`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  if (!next) {
    if (kickedOff && now - kickoffMs > RETRY_AFTER_KICKOFF_MS) skipped += 1
    continue
  }

  file = upsertFrozenWeather(file, next)
  wrote += 1
}

await mkdir(new URL('src/data', ROOT), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(file, null, 2)}\n`)
console.log(
  `Weather snapshot ${slate.week.label}: ${wrote} wrote, ${skipped} already frozen, ${file.games.length} stored.`,
)
