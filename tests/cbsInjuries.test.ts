import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cbsInjurySlug,
  cbsInjuryUrl,
  cbsScheduleUrl,
} from '../src/cbsInjuries.ts'

test('cbsInjurySlug uses location plus nickname, not the short display name', () => {
  assert.equal(
    cbsInjurySlug('Coastal Carolina', 'Chanticleers'),
    'coastal-carolina-chanticleers',
  )
  assert.equal(
    cbsInjurySlug('Michigan State', 'Spartans'),
    'michigan-state-spartans',
  )
  assert.equal(cbsInjurySlug('Citadel', 'Bulldogs'), 'citadel-bulldogs')
  assert.equal(
    cbsInjurySlug('Miami (Fla.)', 'Hurricanes'),
    'miami-fla-hurricanes',
  )
  assert.equal(cbsInjurySlug('Charlotte', '49ers'), 'charlotte-49ers')
  assert.equal(
    cbsInjurySlug('Kansas City', 'Chiefs'),
    'kansas-city-chiefs',
  )
})

test('cbsInjuryUrl writes the CBS per-team injuries path', () => {
  assert.equal(
    cbsInjuryUrl({
      sport: 'NCAAF',
      abbrev: 'STNFRD',
      location: 'Stanford',
      nickname: 'Cardinal',
    }),
    'https://www.cbssports.com/college-football/teams/STNFRD/stanford-cardinal/injuries/',
  )
  assert.equal(
    cbsInjuryUrl({
      sport: 'NFL',
      abbrev: 'KC',
      location: 'Kansas City',
      nickname: 'Chiefs',
    }),
    'https://www.cbssports.com/nfl/teams/KC/kansas-city-chiefs/injuries/',
  )
})

test('cbsScheduleUrl writes the CBS per-team schedule path', () => {
  assert.equal(
    cbsScheduleUrl({
      sport: 'NCAAF',
      abbrev: 'STNFRD',
      location: 'Stanford',
      nickname: 'Cardinal',
    }),
    'https://www.cbssports.com/college-football/teams/STNFRD/stanford-cardinal/schedule/',
  )
  assert.equal(
    cbsScheduleUrl({
      sport: 'NFL',
      abbrev: 'KC',
      location: 'Kansas City',
      nickname: 'Chiefs',
    }),
    'https://www.cbssports.com/nfl/teams/KC/kansas-city-chiefs/schedule/',
  )
})

test('cbsInjuryUrl stays quiet without a location or nickname', () => {
  assert.equal(
    cbsInjuryUrl({
      sport: 'NCAAF',
      abbrev: 'BAMA',
      location: null,
      nickname: 'Crimson Tide',
    }),
    null,
  )
  assert.equal(
    cbsInjuryUrl({ sport: 'NCAAF', abbrev: 'BAMA', location: 'Alabama' }),
    null,
  )
})
