import assert from 'node:assert/strict'
import test from 'node:test'
import type { TeamAppearance } from '../src/teamPerformance.ts'
import { indoorWeatherSnapshot, weatherFromConditions } from '../src/weatherBuckets.ts'
import { buildTeamProfile } from '../src/teamProfile.ts'

function appearance(
  overrides: Partial<TeamAppearance> & Pick<TeamAppearance, 'cbsEventId'>,
): TeamAppearance {
  return {
    week: overrides.week ?? 1,
    weekLabel: `Week ${overrides.week ?? 1}`,
    kickoff: '2026-09-05T12:00:00-04:00',
    sport: 'NCAAF',
    opponent: 'Rival',
    venue: 'home',
    market: 'favorite',
    homeSpread: -7,
    result: 'win',
    awayScore: 10,
    homeScore: 24,
    weather: null,
    ...overrides,
  }
}

function rain(cbsEventId: number, week: number) {
  return weatherFromConditions(
    {
      cbsEventId,
      seasonYear: 2026,
      week,
      kickoff: '2026-09-05T12:00:00-04:00',
    },
    {
      temperature: 62,
      windSpeed: '8 mph',
      shortForecast: 'Rain',
      precipChance: 70,
    },
  )
}

test('waits for four graded games before assigning a style', () => {
  const profile = buildTeamProfile({
    appearances: [
      appearance({ cbsEventId: 1, result: 'win' }),
      appearance({ cbsEventId: 2, result: 'win' }),
      appearance({ cbsEventId: 3, result: 'loss' }),
      appearance({ cbsEventId: 4, result: null }),
    ],
  })
  assert.equal(profile.archetype, 'Building profile')
  assert.match(profile.archetypeDetail, /3 graded games/)
  assert.equal(profile.insight, null)
  assert.equal(profile.decided, 3)
})

test('labels a 4-0 book once the gate is met', () => {
  const profile = buildTeamProfile({
    appearances: [
      appearance({ cbsEventId: 1, week: 1, venue: 'home', market: 'favorite', result: 'win' }),
      appearance({ cbsEventId: 2, week: 2, venue: 'home', market: 'dog', result: 'win' }),
      appearance({ cbsEventId: 3, week: 3, venue: 'home', market: 'favorite', result: 'win' }),
      appearance({ cbsEventId: 4, week: 4, venue: 'home', market: 'dog', result: 'win' }),
    ],
  })
  assert.equal(profile.archetype, 'Covers at home')
  assert.equal(profile.decided, 4)
})

test('labels a loud home coverer and adds a leftover sentence', () => {
  const profile = buildTeamProfile({
    appearances: [
      appearance({ cbsEventId: 1, week: 1, venue: 'home', market: 'favorite', result: 'win' }),
      appearance({ cbsEventId: 2, week: 2, venue: 'home', market: 'dog', result: 'win' }),
      appearance({ cbsEventId: 3, week: 3, venue: 'home', market: 'favorite', result: 'win' }),
      appearance({ cbsEventId: 4, week: 4, venue: 'home', market: 'dog', result: 'win' }),
      appearance({ cbsEventId: 5, week: 5, venue: 'away', market: 'favorite', result: 'loss' }),
      appearance({ cbsEventId: 6, week: 6, venue: 'away', market: 'dog', result: 'loss' }),
      appearance({ cbsEventId: 7, week: 7, venue: 'away', market: 'favorite', result: 'loss' }),
      appearance({ cbsEventId: 8, week: 8, venue: 'away', market: 'dog', result: 'loss' }),
    ],
  })
  assert.equal(profile.archetype, 'Covers at home')
  assert.match(profile.archetypeDetail, /100% ATS across 4 home games/)
  assert.equal(profile.insight, 'Has not covered on the road in 4 of 4 graded games.')
})

test('does not treat overall as the follow-up sentence', () => {
  const profile = buildTeamProfile({
    appearances: Array.from({ length: 8 }, (_, index) =>
      appearance({
        cbsEventId: index + 1,
        week: index + 1,
        venue: 'home',
        market: 'favorite',
        result: 'win',
      }),
    ),
  })
  assert.equal(profile.archetype, 'Covers as a favorite')
  assert.equal(profile.insight, null)
})

test('does not restate wet weather when adverse is the lead', () => {
  const profile = buildTeamProfile({
    appearances: [
      appearance({
        cbsEventId: 1,
        week: 1,
        result: 'win',
        weather: rain(1, 1),
      }),
      appearance({
        cbsEventId: 2,
        week: 2,
        result: 'win',
        weather: rain(2, 2),
      }),
      appearance({
        cbsEventId: 3,
        week: 3,
        result: 'win',
        weather: rain(3, 3),
      }),
      appearance({
        cbsEventId: 4,
        week: 4,
        result: 'win',
        weather: rain(4, 4),
      }),
      appearance({ cbsEventId: 5, week: 5, result: 'loss', weather: null }),
      appearance({ cbsEventId: 6, week: 6, result: 'loss', weather: null }),
    ],
  })
  assert.equal(profile.archetype, 'Covers in bad weather')
  assert.doesNotMatch(profile.insight ?? '', /wet/)
})

test('can lead with a weather split when that is the loudest signal', () => {
  const profile = buildTeamProfile({
    appearances: [
      appearance({
        cbsEventId: 1,
        week: 1,
        venue: 'home',
        market: 'favorite',
        result: 'win',
        weather: indoorWeatherSnapshot({
          cbsEventId: 1,
          seasonYear: 2026,
          week: 1,
          kickoff: '2026-09-05T12:00:00-04:00',
        }),
      }),
      appearance({
        cbsEventId: 2,
        week: 2,
        venue: 'away',
        market: 'dog',
        result: 'win',
        weather: indoorWeatherSnapshot({
          cbsEventId: 2,
          seasonYear: 2026,
          week: 2,
          kickoff: '2026-09-12T12:00:00-04:00',
        }),
      }),
      appearance({
        cbsEventId: 3,
        week: 3,
        venue: 'home',
        market: 'dog',
        result: 'win',
        weather: indoorWeatherSnapshot({
          cbsEventId: 3,
          seasonYear: 2026,
          week: 3,
          kickoff: '2026-09-19T12:00:00-04:00',
        }),
      }),
      appearance({
        cbsEventId: 4,
        week: 4,
        venue: 'away',
        market: 'favorite',
        result: 'win',
        weather: indoorWeatherSnapshot({
          cbsEventId: 4,
          seasonYear: 2026,
          week: 4,
          kickoff: '2026-09-26T12:00:00-04:00',
        }),
      }),
      appearance({ cbsEventId: 5, week: 5, venue: 'home', market: 'favorite', result: 'loss' }),
      appearance({ cbsEventId: 6, week: 6, venue: 'away', market: 'dog', result: 'loss' }),
    ],
  })
  assert.equal(profile.archetype, 'Covers indoors')
  assert.match(profile.archetypeDetail, /indoor games/)
})

test('labels a loud heat coverer', () => {
  const profile = buildTeamProfile({
    appearances: [
      appearance({
        cbsEventId: 1,
        week: 1,
        venue: 'away',
        market: 'dog',
        result: 'win',
        weather: weatherFromConditions(
          {
            cbsEventId: 1,
            seasonYear: 2026,
            week: 1,
            kickoff: '2026-09-05T12:00:00-04:00',
          },
          {
            temperature: 91,
            windSpeed: '6 mph',
            shortForecast: 'Sunny',
            precipChance: 5,
          },
        ),
      }),
      appearance({
        cbsEventId: 2,
        week: 2,
        venue: 'home',
        market: 'favorite',
        result: 'win',
        weather: weatherFromConditions(
          {
            cbsEventId: 2,
            seasonYear: 2026,
            week: 2,
            kickoff: '2026-09-12T12:00:00-04:00',
          },
          {
            temperature: 88,
            windSpeed: '7 mph',
            shortForecast: 'Sunny',
            precipChance: 10,
          },
        ),
      }),
      appearance({
        cbsEventId: 3,
        week: 3,
        venue: 'away',
        market: 'favorite',
        result: 'win',
        weather: weatherFromConditions(
          {
            cbsEventId: 3,
            seasonYear: 2026,
            week: 3,
            kickoff: '2026-09-19T12:00:00-04:00',
          },
          {
            temperature: 86,
            windSpeed: '5 mph',
            shortForecast: 'Mostly Sunny',
            precipChance: 15,
          },
        ),
      }),
      appearance({
        cbsEventId: 4,
        week: 4,
        venue: 'home',
        market: 'dog',
        result: 'win',
        weather: weatherFromConditions(
          {
            cbsEventId: 4,
            seasonYear: 2026,
            week: 4,
            kickoff: '2026-09-26T12:00:00-04:00',
          },
          {
            temperature: 90,
            windSpeed: '8 mph',
            shortForecast: 'Hot',
            precipChance: 5,
          },
        ),
      }),
      appearance({
        cbsEventId: 5,
        week: 5,
        venue: 'home',
        market: 'favorite',
        result: 'loss',
        weather: weatherFromConditions(
          {
            cbsEventId: 5,
            seasonYear: 2026,
            week: 5,
            kickoff: '2026-10-03T12:00:00-04:00',
          },
          {
            temperature: 70,
            windSpeed: '6 mph',
            shortForecast: 'Sunny',
            precipChance: 5,
          },
        ),
      }),
      appearance({
        cbsEventId: 6,
        week: 6,
        venue: 'away',
        market: 'dog',
        result: 'loss',
        weather: weatherFromConditions(
          {
            cbsEventId: 6,
            seasonYear: 2026,
            week: 6,
            kickoff: '2026-10-10T12:00:00-04:00',
          },
          {
            temperature: 68,
            windSpeed: '7 mph',
            shortForecast: 'Cloudy',
            precipChance: 10,
          },
        ),
      }),
    ],
  })
  assert.equal(profile.archetype, 'Covers in the heat')
})

test('says no dominant pattern when the book is even', () => {
  const profile = buildTeamProfile({
    appearances: [
      appearance({ cbsEventId: 1, week: 1, venue: 'home', market: 'favorite', result: 'win' }),
      appearance({ cbsEventId: 2, week: 2, venue: 'home', market: 'favorite', result: 'loss' }),
      appearance({ cbsEventId: 3, week: 3, venue: 'away', market: 'dog', result: 'win' }),
      appearance({ cbsEventId: 4, week: 4, venue: 'away', market: 'dog', result: 'loss' }),
      appearance({ cbsEventId: 5, week: 5, venue: 'home', market: 'dog', result: 'win' }),
      appearance({ cbsEventId: 6, week: 6, venue: 'away', market: 'favorite', result: 'loss' }),
    ],
  })
  assert.equal(profile.archetype, 'No dominant pattern')
  assert.equal(profile.insight, null)
})
