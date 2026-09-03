import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appearanceVenueWord,
  attachFrozenNeutralSite,
  classifyGameSites,
  collectHomeVenues,
  frozenNeutralSiteCaptured,
  recIsNeutralSite,
  siteForTeam,
} from '../src/teamSite.ts'
import type { GameVenue } from '../src/types.ts'

const aviva: GameVenue = {
  stadium: 'Aviva Stadium',
  city: 'Dublin',
  state: 'IE',
  indoor: false,
}
const stanford: GameVenue = {
  stadium: 'Stanford Stadium',
  city: 'Stanford',
  state: 'CA',
  indoor: false,
}
const mercedes: GameVenue = {
  stadium: 'Mercedes-Benz Stadium',
  city: 'Atlanta',
  state: 'GA',
  indoor: true,
}
const sanford: GameVenue = {
  stadium: 'Sanford Stadium',
  city: 'Athens',
  state: 'GA',
  indoor: false,
}

test('Dublin and Mercedes-Benz are neutral for both sides', () => {
  const dublin = classifyGameSites(
    aviva,
    { location: 'North Carolina', name: 'North Carolina' },
    { location: 'TCU', name: 'TCU' },
  )
  assert.deepEqual(dublin, { away: 'neutral', home: 'neutral' })

  const atlanta = classifyGameSites(
    mercedes,
    { location: 'Alabama', name: 'Alabama' },
    { location: 'Georgia', name: 'Georgia' },
  )
  assert.deepEqual(atlanta, { away: 'neutral', home: 'neutral' })
})

test('Hawaii at Stanford is a real road / home site', () => {
  const sites = classifyGameSites(
    stanford,
    { location: 'Hawaii', name: 'Hawaii' },
    { location: 'Stanford', name: 'Stanford' },
  )
  assert.deepEqual(sites, { away: 'away', home: 'home' })
  assert.equal(
    siteForTeam(
      stanford,
      { location: 'Hawaii', name: 'Hawaii' },
      { location: 'Stanford', name: 'Stanford' },
      [],
      [stanford],
      'away',
    ),
    'away',
  )
})

test('Georgia at Sanford is home; a missing venue falls back to CBS', () => {
  const home = classifyGameSites(
    sanford,
    { location: 'Georgia Tech', name: 'Georgia Tech' },
    { location: 'Georgia', name: 'Georgia' },
  )
  assert.deepEqual(home, { away: 'away', home: 'home' })

  const missing = classifyGameSites(
    null,
    { location: 'North Carolina', name: 'North Carolina' },
    { location: 'TCU', name: 'TCU' },
  )
  assert.deepEqual(missing, { away: 'away', home: 'home' })
})

test('collectHomeVenues skips Aviva and keeps Stanford', () => {
  const homes = collectHomeVenues([
    { sport: 'NCAAF', home: 'TCU', venue: aviva },
    { sport: 'NCAAF', home: 'STNFRD', venue: stanford },
  ])
  assert.equal(homes.has('NCAAF:TCU'), false)
  assert.equal(homes.get('NCAAF:STNFRD')?.[0]?.stadium, 'Stanford Stadium')
})

test('appearanceVenueWord and recIsNeutralSite follow the site, not CBS', () => {
  assert.equal(appearanceVenueWord('home'), 'vs')
  assert.equal(appearanceVenueWord('away'), 'at')
  assert.equal(appearanceVenueWord('neutral'), 'neutral vs')
  assert.equal(recIsNeutralSite({ venue: aviva }), true)
  assert.equal(recIsNeutralSite({ venue: stanford }), false)
  assert.equal(recIsNeutralSite({ neutralSite: false, venue: aviva }), false)
})

test('attachFrozenNeutralSite writes then locks the stamp', () => {
  const first = attachFrozenNeutralSite(
    {},
    {
      venue: aviva,
      away: { location: 'North Carolina' },
      home: { location: 'TCU' },
    },
  )
  assert.equal(first.neutralSite, true)
  assert.equal(frozenNeutralSiteCaptured(first), true)
  const locked = attachFrozenNeutralSite(
    first,
    {
      venue: stanford,
      away: { location: 'Hawaii' },
      home: { location: 'Stanford' },
    },
    true,
  )
  assert.deepEqual(locked, first)
})
