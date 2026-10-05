import {
  emptyBowlSide,
  formatFavoriteSpread,
  type BowlGame,
} from './bowlPickem.ts'

export type BowlStraightUpSide = 'home' | 'away' | 'pickem'

export type BowlConfidenceRow = {
  game: BowlGame
  confidence: number
  pickSide: BowlStraightUpSide
  pickCode: 'A' | 'H' | null
  pickName: string | null
  spreadMagnitude: number | null
  priced: boolean
}

function kickoffMs(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function spreadMagnitude(game: BowlGame) {
  return typeof game.homeSpread === 'number' ? Math.abs(game.homeSpread) : null
}

export function pickCodeForSide(side: BowlStraightUpSide): 'A' | 'H' | null {
  if (side === 'away') return 'A'
  if (side === 'home') return 'H'
  return null
}

export function straightUpPick(game: BowlGame): {
  pickSide: BowlStraightUpSide
  pickName: string | null
} {
  if (game.homeSpread == null || game.homeSpread === 0) {
    return { pickSide: 'pickem', pickName: null }
  }
  if (game.homeSpread < 0) {
    return { pickSide: 'home', pickName: game.home.name }
  }
  return { pickSide: 'away', pickName: game.away.name }
}

export function compareBowlRank(left: BowlGame, right: BowlGame) {
  const leftPriced = typeof left.homeSpread === 'number' ? 1 : 0
  const rightPriced = typeof right.homeSpread === 'number' ? 1 : 0
  if (leftPriced !== rightPriced) return rightPriced - leftPriced

  const leftMag = spreadMagnitude(left) ?? -1
  const rightMag = spreadMagnitude(right) ?? -1
  if (leftMag !== rightMag) return rightMag - leftMag

  const byKickoff = kickoffMs(left.kickoff) - kickoffMs(right.kickoff)
  if (byKickoff !== 0) return byKickoff

  return (
    left.away.name.localeCompare(right.away.name) ||
    left.home.name.localeCompare(right.home.name) ||
    left.id.localeCompare(right.id)
  )
}

/** Highest confidence is the number of games; 1 is the least confident. */
export function rankBowlConfidence(games: BowlGame[]): BowlConfidenceRow[] {
  const sorted = [...games].sort(compareBowlRank)
  const n = sorted.length
  return sorted.map((game, index) => {
    const pick = straightUpPick(game)
    const priced = typeof game.homeSpread === 'number'
    return {
      game,
      confidence: n - index,
      pickSide: pick.pickSide,
      pickCode: pickCodeForSide(pick.pickSide),
      pickName: pick.pickName,
      spreadMagnitude: spreadMagnitude(game),
      priced,
    }
  })
}

export function bowlConfidencePoints(gameCount: number) {
  if (gameCount <= 0) return 0
  return (gameCount * (gameCount + 1)) / 2
}

export function favoriteLineLabel(row: BowlConfidenceRow) {
  if (!row.priced || row.game.homeSpread == null) return 'No DraftKings number yet'
  if (row.pickSide === 'pickem') return 'Pick\'em'
  if (!row.pickName) return formatFavoriteSpread(row.game.homeSpread)
  return `${row.pickName} ${formatFavoriteSpread(row.game.homeSpread)}`
}

function exampleGame(
  id: string,
  bowlName: string,
  away: string,
  home: string,
  homeSpread: number | null,
  kickoff: string,
): BowlGame {
  return {
    id,
    providerEventId: null,
    bowlName,
    kickoff,
    away: emptyBowlSide(away),
    home: emptyBowlSide(home),
    homeSpread,
    spreadUpdatedAt: null,
  }
}

/** Layout-only sample. Never mixed into the live file. */
export const EXAMPLE_BOWL_GAMES: BowlGame[] = [
  exampleGame(
    'example-lock',
    'Example Bowl',
    'Sample State',
    'Example University',
    -14.5,
    '2026-12-27T17:00:00.000Z',
  ),
  exampleGame(
    'example-solid',
    'Demo Bowl',
    'Placeholder A&M',
    'Demo Tech',
    -7,
    '2026-12-28T20:00:00.000Z',
  ),
  exampleGame(
    'example-lean',
    'Fixture Bowl',
    'Fixture College',
    'Mock State',
    -3,
    '2027-01-01T17:00:00.000Z',
  ),
  exampleGame(
    'example-coin',
    'Coin Flip Classic',
    'Toss-up State',
    'Coin Flip U',
    0,
    '2027-01-02T00:00:00.000Z',
  ),
]
