import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyOutdoorWeather,
  formatWeatherBucket,
  indoorWeatherSnapshot,
  isColdTemp,
  isHotTemp,
  parseWindMph,
  weatherFromConditions,
} from '../src/weatherBuckets.ts'

test('parseWindMph uses the high end of an NWS range', () => {
  assert.equal(parseWindMph('8 mph'), 8)
  assert.equal(parseWindMph('10 to 20 mph'), 20)
  assert.equal(parseWindMph('Calm'), null)
})

test('classifyOutdoorWeather buckets wet, windy, and benign', () => {
  assert.deepEqual(
    classifyOutdoorWeather({
      shortForecast: 'Sunny',
      windSpeed: '8 mph',
      precipChance: 0,
    }),
    { wet: false, windy: false, bucket: 'benign' },
  )
  assert.deepEqual(
    classifyOutdoorWeather({
      shortForecast: 'Chance Showers',
      windSpeed: '6 mph',
      precipChance: 20,
    }),
    { wet: true, windy: false, bucket: 'adverse' },
  )
  assert.deepEqual(
    classifyOutdoorWeather({
      shortForecast: 'Sunny',
      windSpeed: '15 mph',
      precipChance: 10,
    }),
    { wet: false, windy: true, bucket: 'adverse' },
  )
  assert.equal(
    classifyOutdoorWeather({
      shortForecast: 'Mostly Cloudy',
      windSpeed: '5 mph',
      precipChance: 50,
    }).wet,
    true,
  )
})

test('formatWeatherBucket writes the appearance label', () => {
  const game = {
    cbsEventId: 1,
    seasonYear: 2026,
    week: 1,
    kickoff: '2026-08-30T19:00:00-04:00',
  }
  assert.equal(formatWeatherBucket(indoorWeatherSnapshot(game)), 'Indoor')
  assert.equal(
    formatWeatherBucket(
      weatherFromConditions(game, {
        temperature: 54,
        windSpeed: '18 mph',
        shortForecast: 'Rain',
        precipChance: 80,
      }),
    ),
    'Adverse · wet · wind',
  )
  assert.equal(
    formatWeatherBucket(
      weatherFromConditions(game, {
        temperature: 74,
        windSpeed: '6 mph',
        shortForecast: 'Sunny',
        precipChance: 0,
      }),
    ),
    'Benign',
  )
  assert.equal(
    formatWeatherBucket(
      weatherFromConditions(game, {
        temperature: 91,
        windSpeed: '6 mph',
        shortForecast: 'Sunny',
        precipChance: 5,
      }),
    ),
    'Benign · hot',
  )
  assert.equal(
    formatWeatherBucket(
      weatherFromConditions(game, {
        temperature: 28,
        windSpeed: '8 mph',
        shortForecast: 'Snow',
        precipChance: 70,
      }),
    ),
    'Adverse · wet · cold',
  )
  assert.equal(formatWeatherBucket(null), null)
})

test('hot is 85°F and up, cold is 35°F and down', () => {
  assert.equal(isHotTemp(84), false)
  assert.equal(isHotTemp(85), true)
  assert.equal(isColdTemp(36), false)
  assert.equal(isColdTemp(35), true)
  assert.equal(isHotTemp(null), false)
  assert.equal(isColdTemp(null), false)
})
