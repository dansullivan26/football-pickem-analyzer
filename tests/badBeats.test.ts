import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyBadBeatChange,
  badBeatKey,
  youtubeSearchUrl,
  type BadBeat,
} from '../src/badBeats.ts'

function beat(overrides: Partial<BadBeat> = {}): BadBeat {
  return {
    seasonYear: 2026,
    week: 1,
    weekLabel: 'Week 1',
    cbsEventId: 50027437,
    kickoff: '2026-08-29T19:00:00-04:00',
    away: 'Hawaii',
    home: 'Stanford',
    homeSpread: -5.5,
    note: 'Fumble six',
    markedAt: '2026-08-29T23:00:00.000Z',
    ...overrides,
  }
}

test('youtubeSearchUrl builds a highlights query from the matchup year', () => {
  assert.equal(
    youtubeSearchUrl(beat()),
    'https://www.youtube.com/results?search_query=Hawaii%20Stanford%202026%20highlights',
  )
})

test('applyBadBeatChange adds, replaces, and removes without touching ATS math', () => {
  const first = applyBadBeatChange(
    { updatedAt: null, beats: [] },
    { action: 'add', beat: beat() },
    '2026-08-29T23:00:00.000Z',
  )
  assert.equal(first.beats.length, 1)
  assert.equal(first.beats[0]?.note, 'Fumble six')

  const replaced = applyBadBeatChange(
    first,
    { action: 'add', beat: beat({ note: 'Pick six instead' }) },
    '2026-08-29T23:05:00.000Z',
  )
  assert.equal(replaced.beats.length, 1)
  assert.equal(replaced.beats[0]?.note, 'Pick six instead')

  const cleared = applyBadBeatChange(
    replaced,
    { action: 'remove', key: badBeatKey(2026, 50027437) },
  )
  assert.equal(cleared.beats.length, 0)
})
