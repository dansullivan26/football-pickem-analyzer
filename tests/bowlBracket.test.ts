import assert from 'node:assert/strict'
import test from 'node:test'
import lastYearSheetData from '../src/data/bowl-sheet-2025.json' with { type: 'json' }
import sandboxData from '../src/data/bowl-cfp-sandbox-2025.json' with { type: 'json' }
import {
  lookupHomeSpread,
  parseBowlSide,
  resolveBowlGames,
  sameBowlTeam,
  winnerForkKey,
  winnerForksFromGames,
  type BowlPairLine,
} from '../src/bowlBracket.ts'
import { rankBowlConfidence } from '../src/bowlConfidence.ts'
import {
  bowlGamesFromAdminSheet,
  type BowlSheetFile,
} from '../src/bowlSheet.ts'

const lastYearSheet = lastYearSheetData as BowlSheetFile
const sandboxLines = sandboxData.lines as BowlPairLine[]

test('parses winner-of and TBA sides from the admin sheet wording', () => {
  assert.deepEqual(parseBowlSide('Winner of Miami / Texas AM'), {
    kind: 'winner-of',
    options: ['Miami', 'Texas AM'],
  })
  assert.deepEqual(parseBowlSide('Winner of JMU / Oregon'), {
    kind: 'winner-of',
    options: ['JMU', 'Oregon'],
  })
  assert.equal(parseBowlSide('TBA').kind, 'tba')
  assert.deepEqual(parseBowlSide('Ohio St'), { kind: 'team', name: 'Ohio St' })
  assert.equal(sameBowlTeam('JMU', 'James Madison'), true)
  assert.equal(sameBowlTeam('OU', 'Oklahoma'), true)
})

test('last year CFP quarters share four first-round forks', () => {
  const games = bowlGamesFromAdminSheet(lastYearSheet)
  const forks = winnerForksFromGames(games)
  assert.equal(forks.length, 4)
  assert.ok(forks.some((fork) => fork.label.includes('Miami')))
})

test('guessing Miami vs Texas AM retags Cotton and moves its spread', () => {
  const games = bowlGamesFromAdminSheet(lastYearSheet)
  const miamiKey = winnerForkKey(['Miami', 'Texas AM'])
  const withMiami = resolveBowlGames(
    games,
    { [miamiKey]: 'Miami' },
    sandboxLines,
  )
  const withAandM = resolveBowlGames(
    games,
    { [miamiKey]: 'Texas AM' },
    sandboxLines,
  )
  const cottonMiami = withMiami.find((game) => game.bowlName === 'Cotton Bowl')
  const cottonAandM = withAandM.find((game) => game.bowlName === 'Cotton Bowl')
  assert.equal(cottonMiami?.home.name, 'Miami')
  assert.equal(cottonMiami?.homeSpread, 18.5)
  assert.equal(cottonAandM?.home.name, 'Texas AM')
  assert.equal(cottonAandM?.homeSpread, 6)

  const miamiRank = rankBowlConfidence(withMiami).find(
    (row) => row.game.bowlName === 'Cotton Bowl',
  )
  const aandmRank = rankBowlConfidence(withAandM).find(
    (row) => row.game.bowlName === 'Cotton Bowl',
  )
  assert.ok((miamiRank?.confidence ?? 0) > (aandmRank?.confidence ?? 0))
})

test('looks up a swapped pair as the flipped home spread', () => {
  assert.equal(
    lookupHomeSpread('Miami', 'Ohio St', [
      { away: 'Ohio St', home: 'Miami', homeSpread: 18.5 },
    ]),
    -18.5,
  )
})
