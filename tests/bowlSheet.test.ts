import assert from 'node:assert/strict'
import test from 'node:test'
import lastYearSheetData from '../src/data/bowl-sheet-2025.json' with { type: 'json' }
import {
  BOWL_SHEET_HEADER,
  duplicatePointValues,
  formatBowlSheetTsv,
  isTbaMatchup,
  linesFromAdminSheet,
  linesFromRankedGames,
  type BowlSheetFile,
} from '../src/bowlSheet.ts'
import { rankBowlConfidence } from '../src/bowlConfidence.ts'
import { emptyBowlSide, type BowlGame } from '../src/bowlPickem.ts'

const lastYearSheet = lastYearSheetData as BowlSheetFile

test('2025-26 admin sheet is 41 unique point values with A or H', () => {
  assert.equal(lastYearSheet.games.length, 41)
  assert.equal(lastYearSheet.pointMax, 41)
  const points = lastYearSheet.games.map((game) => game.submittedPoints)
  assert.deepEqual([...new Set(points)].sort((a, b) => a - b), points.slice().sort((a, b) => a - b))
  assert.deepEqual([...duplicatePointValues(points)], [])
  assert.ok(lastYearSheet.games.every((game) => game.submittedPoints >= 1 && game.submittedPoints <= 41))
  const picks = new Set(lastYearSheet.games.map((game) => game.submittedPick))
  assert.ok(picks.has('A') && picks.has('H'))
  const tba = lastYearSheet.games.filter((game) =>
    isTbaMatchup(game.away, game.home),
  )
  assert.deepEqual(
    tba.map((game) => [game.bowlName, game.submittedPick, game.submittedPoints]),
    [
      ['Fiesta Bowl', null, 2],
      ['Peach Bowl', null, 3],
      ['CFP National Championship', null, 1],
    ],
  )
})

test('sheet TSV matches the admin workbook columns', () => {
  const lines = linesFromAdminSheet(lastYearSheet)
  const text = formatBowlSheetTsv(lines)
  const [header, first, ...rest] = text.split('\n')
  assert.equal(header, BOWL_SHEET_HEADER.join('\t'))
  assert.equal(rest.length, 40)
  assert.match(first ?? '', /^Fri, Dec 19\tMyrtle Beach Bowl\t.*\tKennesaw State vs Western Michigan\tH\t17$/)
  assert.equal(lines[0]?.pick, 'H')
  assert.equal(lines[lines.length - 1]?.points, 1)
  assert.equal(lines[lines.length - 1]?.pick, null)
})

test('duplicate point values are the numbers the sheet would paint red', () => {
  assert.deepEqual([...duplicatePointValues([41, 2, 41, null, 2, 3])].sort(), [2, 41])
})

test('live ranking fills A/H and unique points in schedule order', () => {
  const games: BowlGame[] = [
    {
      id: 'later',
      providerEventId: null,
      bowlName: 'Peach Bowl',
      kickoff: '2027-01-09T00:00:00.000Z',
      away: emptyBowlSide('TBA'),
      home: emptyBowlSide('TBA'),
      homeSpread: null,
      spreadUpdatedAt: null,
    },
    {
      id: 'lock',
      providerEventId: null,
      bowlName: 'Orange Bowl',
      kickoff: '2026-12-19T17:00:00.000Z',
      away: emptyBowlSide('Dog'),
      home: emptyBowlSide('Favorite'),
      homeSpread: -14.5,
      spreadUpdatedAt: null,
    },
    {
      id: 'road',
      providerEventId: null,
      bowlName: 'Cotton Bowl',
      kickoff: '2026-12-20T20:00:00.000Z',
      away: emptyBowlSide('Road Fav'),
      home: emptyBowlSide('Home Dog'),
      homeSpread: 7,
      spreadUpdatedAt: null,
    },
  ]
  const ranked = rankBowlConfidence(games)
  const sheet = linesFromRankedGames(games, ranked, 'sheet')
  assert.deepEqual(
    sheet.map((line) => [line.bowlName, line.pick, line.points]),
    [
      ['Orange Bowl', 'H', 3],
      ['Cotton Bowl', 'A', 2],
      ['Peach Bowl', null, 1],
    ],
  )
  const byPoints = linesFromRankedGames(games, ranked, 'confidence')
  assert.equal(byPoints[0]?.points, 3)
  assert.equal(byPoints[0]?.pick, 'H')
})
