import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cardDeviationStorageKey,
  deviationIdsForWeek,
  mergeOverrideGames,
  rememberedDeviationIds,
} from '../src/cardOverrides.ts'
import type { CardOverrides } from '../src/types.ts'

const overrides: CardOverrides = {
  updatedAt: '2026-09-05T18:06:20.886Z',
  weeks: [
    {
      week: 1,
      sentAt: '2026-09-05T18:06:20.886Z',
      games: [
        { gameId: 'keep-open', deviate: true },
        { gameId: 'already-final', deviate: true },
      ],
    },
  ],
}

test('deviationIdsForWeek reads the last sent flips for that week', () => {
  assert.deepEqual(deviationIdsForWeek(overrides, 1), [
    'keep-open',
    'already-final',
  ])
  assert.deepEqual(deviationIdsForWeek(overrides, 2), [])
  assert.deepEqual(deviationIdsForWeek(null, 1), [])
})

test('rememberedDeviationIds prefers this-session send over the committed file', () => {
  const storage = new Map<string, string>()
  storage.set(
    cardDeviationStorageKey(2026, 1),
    JSON.stringify(['keep-open', 'new-flip']),
  )

  assert.deepEqual(
    rememberedDeviationIds({
      week: 1,
      seasonYear: 2026,
      savedIds: deviationIdsForWeek(overrides, 1),
      pickIds: ['keep-open', 'new-flip', 'untouched'],
      storage: {
        getItem: (key) => storage.get(key) ?? null,
      },
    }).sort(),
    ['keep-open', 'new-flip'],
  )
})

test('rememberedDeviationIds falls back to the committed week when session is empty', () => {
  assert.deepEqual(
    rememberedDeviationIds({
      week: 1,
      seasonYear: 2026,
      savedIds: deviationIdsForWeek(overrides, 1),
      pickIds: ['keep-open', 'untouched'],
      storage: { getItem: () => null },
    }),
    ['keep-open'],
  )
})

test('mergeOverrideGames keeps flips that were not on this later card', () => {
  assert.deepEqual(
    mergeOverrideGames(overrides.weeks[0]?.games, [
      { gameId: 'keep-open', deviate: true },
      { gameId: 'new-flip', deviate: true },
      { gameId: 'cleared', deviate: false },
    ]),
    [
      { gameId: 'already-final', deviate: true },
      { gameId: 'keep-open', deviate: true },
      { gameId: 'new-flip', deviate: true },
    ],
  )
})

test('mergeOverrideGames can unmark a game that is on the new card', () => {
  assert.deepEqual(
    mergeOverrideGames(
      [
        { gameId: 'keep-open', deviate: true },
        { gameId: 'already-final', deviate: true },
      ],
      [{ gameId: 'keep-open', deviate: false }],
    ),
    [{ gameId: 'already-final', deviate: true }],
  )
})
