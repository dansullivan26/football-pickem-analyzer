import { normalizeScheduleName } from './lastKickoff.ts'
import { emptyBowlSide, type BowlGame } from './bowlPickem.ts'

export type BowlSideSpec =
  | { kind: 'team'; name: string }
  | { kind: 'winner-of'; options: [string, string] }
  | { kind: 'tba' }

export type BowlPairLine = {
  away: string
  home: string
  homeSpread: number
}

export type BowlGuesses = Record<string, string>

export type WinnerFork = {
  key: string
  options: [string, string]
  label: string
}

export type TbaSlot = {
  gameId: string
  bowlName: string
  side: 'away' | 'home'
  key: string
}

/** Sheet abbreviations that do not normalize to the first-round school name. */
const TEAM_ALIASES: Record<string, string> = {
  jmu: 'james madison',
  ou: 'oklahoma',
  'texas a m': 'texas am',
  'texas a and m': 'texas am',
  'ohio state': 'ohio st',
  'ole miss': 'ole miss',
  'miami fl': 'miami',
  'miami florida': 'miami',
}

function teamKey(name: string) {
  const normalized = normalizeScheduleName(name)
  return TEAM_ALIASES[normalized] ?? normalized
}

export function sameBowlTeam(left: string, right: string) {
  const a = teamKey(left)
  const b = teamKey(right)
  return Boolean(a) && a === b
}

export function parseBowlSide(raw: string | null | undefined): BowlSideSpec {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!name || /^tba$/i.test(name)) return { kind: 'tba' }
  const winner = name.match(/^winner of (.+?) \/ (.+)$/i)
  if (winner?.[1] && winner[2]) {
    return { kind: 'winner-of', options: [winner[1].trim(), winner[2].trim()] }
  }
  return { kind: 'team', name }
}

export function winnerForkKey(options: [string, string]) {
  return [...options.map(teamKey)].sort().join('|')
}

export function tbaSlotKey(gameId: string, side: 'away' | 'home') {
  return `tba:${gameId}:${side}`
}

export function lookupHomeSpread(
  away: string,
  home: string,
  lines: BowlPairLine[],
) {
  for (const line of lines) {
    if (sameBowlTeam(away, line.away) && sameBowlTeam(home, line.home)) {
      return line.homeSpread
    }
    if (sameBowlTeam(away, line.home) && sameBowlTeam(home, line.away)) {
      return -line.homeSpread
    }
  }
  return null
}

export function pairLinesFromGames(games: BowlGame[]): BowlPairLine[] {
  const lines: BowlPairLine[] = []
  for (const game of games) {
    if (typeof game.homeSpread !== 'number') continue
    const away = parseBowlSide(game.away.name)
    const home = parseBowlSide(game.home.name)
    if (away.kind !== 'team' || home.kind !== 'team') continue
    lines.push({
      away: away.name,
      home: home.name,
      homeSpread: game.homeSpread,
    })
  }
  return lines
}

export function winnerForksFromGames(games: BowlGame[]): WinnerFork[] {
  const forks = new Map<string, WinnerFork>()
  for (const game of games) {
    for (const spec of [parseBowlSide(game.away.name), parseBowlSide(game.home.name)]) {
      if (spec.kind !== 'winner-of') continue
      const key = winnerForkKey(spec.options)
      if (!forks.has(key)) {
        forks.set(key, {
          key,
          options: spec.options,
          label: `${spec.options[0]} / ${spec.options[1]}`,
        })
      }
    }
  }
  return [...forks.values()]
}

export function tbaSlotsFromGames(games: BowlGame[]): TbaSlot[] {
  const slots: TbaSlot[] = []
  for (const game of games) {
    if (parseBowlSide(game.away.name).kind === 'tba') {
      slots.push({
        gameId: game.id,
        bowlName: game.bowlName ?? 'Bowl game',
        side: 'away',
        key: tbaSlotKey(game.id, 'away'),
      })
    }
    if (parseBowlSide(game.home.name).kind === 'tba') {
      slots.push({
        gameId: game.id,
        bowlName: game.bowlName ?? 'Bowl game',
        side: 'home',
        key: tbaSlotKey(game.id, 'home'),
      })
    }
  }
  return slots
}

export function cfpTeamNames(games: BowlGame[]) {
  const names = new Map<string, string>()
  function add(name: string) {
    const key = teamKey(name)
    if (!key || names.has(key)) return
    names.set(key, name)
  }
  for (const game of games) {
    if (!isCfpBowlName(game.bowlName)) continue
    for (const spec of [parseBowlSide(game.away.name), parseBowlSide(game.home.name)]) {
      if (spec.kind === 'team') add(spec.name)
      if (spec.kind === 'winner-of') {
        add(spec.options[0])
        add(spec.options[1])
      }
    }
  }
  return [...names.values()].sort((left, right) => left.localeCompare(right))
}

export function isCfpBowlName(name: string | null | undefined) {
  return /cfp|cotton|orange|rose|sugar|fiesta|peach|national championship/i.test(
    name ?? '',
  )
}

export function resolveBowlSide(
  spec: BowlSideSpec,
  guesses: BowlGuesses,
  tbaKey?: string,
) {
  if (spec.kind === 'team') return spec.name
  if (spec.kind === 'winner-of') {
    const picked = guesses[winnerForkKey(spec.options)]
    if (!picked) return null
    return spec.options.find((option) => sameBowlTeam(option, picked)) ?? picked
  }
  if (!tbaKey) return null
  return guesses[tbaKey] ?? null
}

export function resolveBowlGames(
  games: BowlGame[],
  guesses: BowlGuesses,
  lines: BowlPairLine[],
): BowlGame[] {
  return games.map((game) => {
    const awaySpec = parseBowlSide(game.away.name)
    const homeSpec = parseBowlSide(game.home.name)
    const awayName =
      resolveBowlSide(awaySpec, guesses, tbaSlotKey(game.id, 'away')) ??
      game.away.name
    const homeName =
      resolveBowlSide(homeSpec, guesses, tbaSlotKey(game.id, 'home')) ??
      game.home.name
    const awayResolved =
      parseBowlSide(awayName).kind === 'team' &&
      awayName.toUpperCase() !== 'TBA'
    const homeResolved =
      parseBowlSide(homeName).kind === 'team' &&
      homeName.toUpperCase() !== 'TBA'
    const homeSpread =
      awayResolved && homeResolved
        ? lookupHomeSpread(awayName, homeName, lines)
        : null
    return {
      ...game,
      away: { ...emptyBowlSide(awayName), abbrev: game.away.abbrev, teamId: game.away.teamId },
      home: { ...emptyBowlSide(homeName), abbrev: game.home.abbrev, teamId: game.home.teamId },
      homeSpread,
    }
  })
}

export function hasBracketQuestions(games: BowlGame[]) {
  return winnerForksFromGames(games).length > 0 || tbaSlotsFromGames(games).length > 0
}
