import { formatGameScore, gameScores } from './gameStatus.ts'
import { poolSpreadForSide } from './cardScoring.ts'
import type { TeamAppearance } from './teamPerformance.ts'

export type ComingOffTeam = {
  nickname?: string | null
  appearances: readonly TeamAppearance[]
}

export type StraightUpResult = 'win' | 'loss'
export type LastOutcomeQuality = 'good' | 'bad'

export type ComingOffNote = {
  line: string
  title: string
}

function straightUpResult(row: TeamAppearance): StraightUpResult | null {
  const scores = gameScores(row)
  if (!scores || scores.away === scores.home) return null
  const won =
    row.side === 'away' ? scores.away > scores.home : scores.home > scores.away
  return won ? 'win' : 'loss'
}

/** Covered = good, did not cover = bad. A push has no adjective. */
export function lastOutcomeQuality(
  row: TeamAppearance,
): LastOutcomeQuality | null {
  if (row.result === 'win') return 'good'
  if (row.result === 'loss') return 'bad'
  return null
}

export function lastGradedAppearance(
  appearances: readonly TeamAppearance[],
  beforeKickoff: string,
): TeamAppearance | null {
  const before = Date.parse(beforeKickoff)
  if (Number.isNaN(before)) return null
  return (
    [...appearances]
      .filter((row) => {
        if (!straightUpResult(row)) return false
        const kick = Date.parse(row.kickoff)
        return !Number.isNaN(kick) && kick < before
      })
      .sort(
        (left, right) =>
          Date.parse(right.kickoff) - Date.parse(left.kickoff) ||
          right.cbsEventId - left.cbsEventId,
      )[0] ?? null
  )
}

function againstLabel(
  row: TeamAppearance,
  opponent: ComingOffTeam | null | undefined,
) {
  const nickname = opponent?.nickname?.trim()
  if (nickname) return `the ${nickname}`
  return row.opponent
}

function coverPhrase(row: TeamAppearance) {
  if (row.result === 'win') return 'covered'
  if (row.result === 'loss') return 'did not cover'
  if (row.result === 'push') return 'pushed'
  return null
}

function rolePhrase(row: TeamAppearance) {
  if (row.market === 'pickem') return "as a pick'em"
  const points = Math.abs(poolSpreadForSide(row.homeSpread, row.side))
  const label = Number.isInteger(points) ? String(points) : points.toFixed(1)
  return row.market === 'favorite'
    ? `as a ${label}-point favorite`
    : `as a ${label}-point dog`
}

export function formatComingOffNote(
  teamName: string,
  row: TeamAppearance,
  opponent?: ComingOffTeam | null,
): ComingOffNote | null {
  const result = straightUpResult(row)
  if (!result) return null
  const quality = lastOutcomeQuality(row)
  const qualityBit = quality ? `${quality} ` : ''
  const against = againstLabel(row, opponent)
  const score = formatGameScore(row)
  const cover = coverPhrase(row)
  const facts = [
    score ? `${score}` : null,
    cover ? `${cover} ${rolePhrase(row)}` : rolePhrase(row),
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ')
  return {
    line: `${teamName} coming off a ${qualityBit}${result} against ${against}`,
    title: `${facts}. Informational only — not in the recommendation.`,
  }
}

export function comingOffNotesForGame(
  game: {
    sport: 'NFL' | 'NCAAF'
    kickoff: string
    away: { abbrev: string; name: string }
    home: { abbrev: string; name: string }
  },
  teamsByKey: ReadonlyMap<string, ComingOffTeam>,
  teamKeyOf: (sport: 'NFL' | 'NCAAF', abbrev: string) => string,
): { away: ComingOffNote | null; home: ComingOffNote | null } {
  if (game.sport !== 'NFL') return { away: null, home: null }
  const noteFor = (abbrev: string, name: string) => {
    const team = teamsByKey.get(teamKeyOf(game.sport, abbrev))
    const last = team ? lastGradedAppearance(team.appearances, game.kickoff) : null
    if (!last) return null
    const opponent = teamsByKey.get(teamKeyOf(game.sport, last.opponentAbbrev))
    return formatComingOffNote(name, last, opponent)
  }
  return {
    away: noteFor(game.away.abbrev, game.away.name),
    home: noteFor(game.home.abbrev, game.home.name),
  }
}
