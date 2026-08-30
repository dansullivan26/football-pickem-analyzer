import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatWeatherChip,
  hourlyPeriodForKickoff,
  usStateName,
  venueQuery,
  weatherCacheMs,
  weatherForVenueKind,
} from '../src/nwsWeather.ts'

test('usStateName accepts abbreviations and full names', () => {
  assert.equal(usStateName('CA'), 'California')
  assert.equal(usStateName('Hawaii'), 'Hawaii')
  assert.equal(usStateName('IE'), null)
})

test('venueQuery skips indoor-unrelated missing or foreign places', () => {
  assert.equal(venueQuery({ stadium: 'Aviva', city: 'Dublin', state: 'IE', indoor: false }), null)
  assert.deepEqual(
    venueQuery({ stadium: 'Stanford Stadium', city: 'Stanford', state: 'CA', indoor: false }),
    { city: 'Stanford', stateName: 'California', key: 'Stanford|California' },
  )
})

test('weatherForVenueKind short-circuits indoor and unknown venues', () => {
  assert.equal(
    weatherForVenueKind({ stadium: 'Dome', city: 'Houston', state: 'TX', indoor: true }),
    'indoor',
  )
  assert.equal(
    weatherForVenueKind({ stadium: 'Aviva', city: 'Dublin', state: 'IE', indoor: false }),
    'unavailable',
  )
  assert.equal(
    weatherForVenueKind({
      stadium: 'Stanford Stadium',
      city: 'Stanford',
      state: 'CA',
      indoor: false,
    }),
    'fetch',
  )
})

test('hourlyPeriodForKickoff uses the covering hour and ignores stale forecasts', () => {
  const periods = [
    {
      startTime: '2026-08-30T18:00:00-04:00',
      endTime: '2026-08-30T19:00:00-04:00',
      temperature: 74,
      temperatureUnit: 'F',
      windSpeed: '8 mph',
      shortForecast: 'Sunny',
    },
    {
      startTime: '2026-08-30T19:00:00-04:00',
      endTime: '2026-08-30T20:00:00-04:00',
      temperature: 71,
      temperatureUnit: 'F',
      windSpeed: '6 mph',
      shortForecast: 'Clear',
    },
  ]
  assert.equal(
    hourlyPeriodForKickoff(periods, '2026-08-30T19:10:00-04:00')?.temperature,
    71,
  )
  assert.equal(hourlyPeriodForKickoff(periods, '2026-08-29T19:00:00-04:00'), null)
})

test('weatherCacheMs is shorter on game day', () => {
  const kickoff = '2026-08-30T19:00:00-04:00'
  const gameDay = Date.parse('2026-08-30T16:00:00-04:00')
  const midweek = Date.parse('2026-08-27T12:00:00-04:00')
  assert.equal(weatherCacheMs(kickoff, gameDay), 45 * 60 * 1000)
  assert.equal(weatherCacheMs(kickoff, midweek), 4 * 60 * 60 * 1000)
})

test('formatWeatherChip writes the card label', () => {
  assert.equal(formatWeatherChip({ status: 'loading' }), 'Weather…')
  assert.equal(formatWeatherChip({ status: 'indoor' }), 'Indoor')
  assert.equal(formatWeatherChip({ status: 'unavailable' }), 'Weather unavailable')
  assert.equal(
    formatWeatherChip({
      status: 'ready',
      temperature: 74,
      unit: 'F',
      shortForecast: 'Sunny',
      windSpeed: '8 mph',
    }),
    '74° · Sunny · 8 mph',
  )
})
