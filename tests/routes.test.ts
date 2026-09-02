import assert from 'node:assert/strict'
import test from 'node:test'
import {
  locationFromPath,
  pathForBadBeat,
  pathForPlayer,
  pathForTeam,
  pathForView,
  TEAM_PROFILE_HASH,
  viewFromPath,
} from '../src/routes.ts'

test('locationFromPath reads team slugs and keeps the Teams view', () => {
  assert.deepEqual(locationFromPath('/teams', ''), {
    view: 'teams',
    teamSlug: null,
    playerSlug: null,
  })
  assert.deepEqual(locationFromPath('/teams/alabama', ''), {
    view: 'teams',
    teamSlug: 'alabama',
    playerSlug: null,
  })
  assert.deepEqual(locationFromPath('/teams/north-carolina/', ''), {
    view: 'teams',
    teamSlug: 'north-carolina',
    playerSlug: null,
  })
  assert.equal(viewFromPath('/teams/alabama', ''), 'teams')
  assert.equal(viewFromPath('/players', ''), 'players')
  assert.equal(viewFromPath('/bad-beats', ''), 'bad-beats')
})

test('locationFromPath reads player slugs and keeps the Players view', () => {
  assert.deepEqual(locationFromPath('/players', ''), {
    view: 'players',
    teamSlug: null,
    playerSlug: null,
  })
  assert.deepEqual(locationFromPath('/players/dan-sullivan', ''), {
    view: 'players',
    teamSlug: null,
    playerSlug: 'dan-sullivan',
  })
  assert.deepEqual(locationFromPath('/players/jeff-miller/', ''), {
    view: 'players',
    teamSlug: null,
    playerSlug: 'jeff-miller',
  })
  assert.equal(viewFromPath('/players/dan-sullivan', ''), 'players')
})

test('pathForView writes a team deep link', () => {
  assert.equal(pathForView('teams'), '/teams')
  assert.equal(pathForView('teams', 'alabama'), '/teams/alabama')
  assert.equal(pathForView('teams', null), '/teams')
  assert.equal(pathForView('bad-beats'), '/bad-beats')
  assert.equal(pathForBadBeat(2026, 50027437), '/bad-beats#bad-beat-2026-50027437')
})

test('pathForView writes a player deep link', () => {
  assert.equal(pathForView('players'), '/players')
  assert.equal(pathForView('players', 'dan-sullivan'), '/players/dan-sullivan')
  assert.equal(pathForView('players', null), '/players')
  assert.equal(pathForPlayer('dan-sullivan'), '/players/dan-sullivan')
})

test('pathForTeam anchors on the profile section', () => {
  assert.equal(pathForTeam('alabama'), `/teams/alabama#${TEAM_PROFILE_HASH}`)
  assert.equal(TEAM_PROFILE_HASH, 'team-profile')
})
