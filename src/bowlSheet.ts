import {
  pickCodeForSide,
  type BowlConfidenceRow,
} from './bowlConfidence.ts'
import { emptyBowlSide, formatBowlSpread, type BowlGame } from './bowlPickem.ts'

export type BowlSheetPick = 'A' | 'H'

export type BowlSheetGame = {
  sheetRow: number
  bowlName: string
  location: string | null
  date: string
  dateLabel: string
  timeLabel: string | null
  away: string
  home: string
  submittedPick: BowlSheetPick | null
  submittedPoints: number
}

export type BowlSheetFile = {
  seasonYear: number
  seasonLabel: string
  pointMax: number
  source: string
  games: BowlSheetGame[]
}

export type BowlSheetLine = {
  key: string
  dateLabel: string
  bowlName: string
  location: string | null
  timeLabel: string | null
  away: string
  home: string
  pick: BowlSheetPick | null
  points: number | null
  spreadLabel: string
  duplicate: boolean
  tba: boolean
}

export const BOWL_SHEET_HEADER = [
  'DATE',
  'BOWL',
  'LOCATION',
  'TIME',
  'AWAY  VS  HOME',
  'A or H',
  'Point Value',
] as const

export function isTbaMatchup(away: string, home: string) {
  return (
    !away.trim() ||
    !home.trim() ||
    away.trim().toUpperCase() === 'TBA' ||
    home.trim().toUpperCase() === 'TBA'
  )
}

export function bowlSheetMatchup(away: string, home: string) {
  return `${away} vs ${home}`
}

export function formatSheetDate(iso: string | null | undefined) {
  if (!iso) return ''
  const stamp = Date.parse(iso.length === 10 ? `${iso}T12:00:00.000Z` : iso)
  if (!Number.isFinite(stamp)) return iso
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: iso.length === 10 ? 'UTC' : undefined,
  }).format(new Date(stamp))
}

export function formatSheetTime(iso: string | null | undefined) {
  if (!iso || iso.length === 10) return null
  const stamp = Date.parse(iso)
  if (!Number.isFinite(stamp)) return null
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(stamp))
}

function markDuplicates(lines: BowlSheetLine[]): BowlSheetLine[] {
  const dups = duplicatePointValues(lines.map((line) => line.points))
  return lines.map((line) => ({
    ...line,
    duplicate: line.points != null && dups.has(line.points),
  }))
}

export function linesFromAdminSheet(sheet: BowlSheetFile): BowlSheetLine[] {
  return markDuplicates(
    [...sheet.games]
      .sort((left, right) => left.sheetRow - right.sheetRow)
      .map((game) => ({
        key: `sheet-${sheet.seasonYear}-${game.sheetRow}`,
        dateLabel: game.dateLabel,
        bowlName: game.bowlName,
        location: game.location,
        timeLabel: game.timeLabel,
        away: game.away,
        home: game.home,
        pick: game.submittedPick,
        points: game.submittedPoints,
        spreadLabel: '—',
        duplicate: false,
        tba: isTbaMatchup(game.away, game.home),
      })),
  )
}

export function linesFromRankedGames(
  games: BowlGame[],
  ranked: BowlConfidenceRow[],
  order: 'sheet' | 'confidence',
): BowlSheetLine[] {
  const byId = new Map(ranked.map((row) => [row.game.id, row]))
  const ordered = [...games].sort((left, right) => {
    if (order === 'confidence') {
      return (byId.get(right.id)?.confidence ?? 0) - (byId.get(left.id)?.confidence ?? 0)
    }
    return (
      (left.kickoff ?? '').localeCompare(right.kickoff ?? '') ||
      (left.bowlName ?? '').localeCompare(right.bowlName ?? '') ||
      left.id.localeCompare(right.id)
    )
  })
  return markDuplicates(
    ordered.map((game) => {
      const row = byId.get(game.id)
      return {
        key: game.id,
        dateLabel: formatSheetDate(game.kickoff),
        bowlName: game.bowlName ?? 'Bowl game',
        location: game.location ?? null,
        timeLabel: game.timeLabel ?? formatSheetTime(game.kickoff),
        away: game.away.name,
        home: game.home.name,
        pick: row ? pickCodeForSide(row.pickSide) : null,
        points: row?.confidence ?? null,
        spreadLabel: row?.priced ? formatBowlSpread(row.game.homeSpread) : '—',
        duplicate: false,
        tba: isTbaMatchup(game.away.name, game.home.name),
      }
    }),
  )
}

export function formatBowlSheetTsv(lines: BowlSheetLine[]) {
  const rows = lines.map((line) =>
    [
      line.dateLabel,
      line.bowlName,
      line.location ?? '',
      line.timeLabel ?? '',
      bowlSheetMatchup(line.away, line.home),
      line.pick ?? '',
      line.points ?? '',
    ].join('\t'),
  )
  return [BOWL_SHEET_HEADER.join('\t'), ...rows].join('\n')
}

export function duplicatePointValues(values: Array<number | null | undefined>) {
  const counts = new Map<number, number>()
  for (const value of values) {
    if (value == null) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([value]) => value),
  )
}

export function bowlGamesFromAdminSheet(sheet: BowlSheetFile): BowlGame[] {
  return sheet.games.map((game) => ({
    id: `sheet-${sheet.seasonYear}-${game.sheetRow}`,
    providerEventId: null,
    bowlName: game.bowlName,
    location: game.location,
    timeLabel: game.timeLabel,
    kickoff: game.date ? `${game.date}T18:00:00.000Z` : null,
    away: emptyBowlSide(game.away),
    home: emptyBowlSide(game.home),
    homeSpread: null,
    spreadUpdatedAt: null,
  }))
}
