import assert from 'node:assert/strict'
import test from 'node:test'
import { locationFromPath, pathForView, viewFromPath } from '../src/routes.ts'

test('locationFromPath reads team slugs and keeps the Teams view', () => {
  assert.deepEqual(locationFromPath('/teams', ''), {
    view: 'teams',
    teamSlug: null,
  })
  assert.deepEqual(locationFromPath('/teams/alabama', ''), {
    view: 'teams',
    teamSlug: 'alabama',
  })
  assert.deepEqual(locationFromPath('/teams/north-carolina/', ''), {
    view: 'teams',
    teamSlug: 'north-carolina',
  })
  assert.equal(viewFromPath('/teams/alabama', ''), 'teams')
  assert.equal(viewFromPath('/players', ''), 'players')
  assert.equal(viewFromPath('/bad-beats', ''), 'bad-beats')
})

test('pathForView writes a team deep link', () => {
  assert.equal(pathForView('teams'), '/teams')
  assert.equal(pathForView('teams', 'alabama'), '/teams/alabama')
  assert.equal(pathForView('teams', null), '/teams')
  assert.equal(pathForView('bad-beats'), '/bad-beats')
})
