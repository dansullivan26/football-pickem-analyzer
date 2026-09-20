import assert from 'node:assert/strict'
import test from 'node:test'
import moneyHistoryFile from '../src/data/money-history.json' with { type: 'json' }
import {
  formatMoneyPlace,
  linkMoneyHistory,
  moneyFinishesForSlug,
  moneyNameKey,
  type MoneyHistoryFile,
} from '../src/moneyHistory.ts'

const file = moneyHistoryFile as MoneyHistoryFile

test('moneyNameKey collapses CBS spacing so Shawn Sedate matches the roster', () => {
  assert.equal(moneyNameKey('Shawn Sedate'), moneyNameKey('Shawn  Sedate'))
  assert.equal(moneyNameKey('rob bandelier'), 'rob-bandelier')
})

test('formatMoneyPlace writes 1st, 2nd, and 3rd', () => {
  assert.equal(formatMoneyPlace(1), '1st')
  assert.equal(formatMoneyPlace(2), '2nd')
  assert.equal(formatMoneyPlace(3), '3rd')
})

test('linkMoneyHistory newest season first and matches returning names', () => {
  const seasons = linkMoneyHistory(file, [
    { entryId: 'shawn', name: 'Shawn  Sedate' },
    { entryId: 'dan', name: 'Dan Sullivan' },
    { entryId: 'drake', name: 'Drake Everson' },
    { entryId: 'rob', name: 'rob bandelier' },
    { entryId: 'john', name: 'John Williams' },
    { entryId: 'tyler', name: 'Tyler Kopas' },
  ])

  assert.deepEqual(
    seasons.map((season) => season.seasonYear),
    [2025, 2024],
  )
  assert.equal(seasons[0]?.places[0]?.name, 'Shawn Sedate')
  assert.equal(seasons[0]?.places[0]?.score, 248)
  assert.equal(seasons[0]?.places[0]?.slug, 'shawn-sedate')
  assert.equal(seasons[0]?.places[1]?.slug, 'dan-sullivan')
  assert.equal(seasons[1]?.places[0]?.slug, 'rob-bandelier')
  assert.equal(seasons[1]?.places[2]?.score, 230)
})

test('moneyFinishesForSlug lists a returning player\'s cash finishes', () => {
  const seasons = linkMoneyHistory(file, [
    { entryId: 'dan', name: 'Dan Sullivan' },
  ])
  assert.deepEqual(moneyFinishesForSlug(seasons, 'dan-sullivan'), [
    { seasonYear: 2025, place: 2, score: 237 },
  ])
  assert.deepEqual(moneyFinishesForSlug(seasons, 'missing'), [])
})
