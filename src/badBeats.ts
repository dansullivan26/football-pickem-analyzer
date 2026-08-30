export type BadBeat = {
  seasonYear: number
  week: number
  weekLabel: string
  cbsEventId: number
  kickoff: string
  away: string
  home: string
  homeSpread: number
  note: string | null
  markedAt: string
}

export type BadBeatsFile = {
  updatedAt: string | null
  beats: BadBeat[]
}

export function badBeatKey(seasonYear: number, cbsEventId: number) {
  return `${seasonYear}:${cbsEventId}`
}

export function formatBadBeatDate(kickoff: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
    .format(new Date(kickoff))
    .replace(',', '')
}

export function youtubeSearchUrl(beat: Pick<BadBeat, 'away' | 'home' | 'kickoff'>) {
  const year = new Date(beat.kickoff).getFullYear()
  const query = `${beat.away} ${beat.home} ${year} highlights`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

export type FrozenCardPick = {
  cbsEventId: number
  pickedSide: 'home' | 'away' | null
  deviated?: boolean
}

export function submittedCardSide(
  game: Pick<FrozenCardPick, 'pickedSide' | 'deviated'>,
): 'home' | 'away' | null {
  if (!game.pickedSide) return null
  if (!game.deviated) return game.pickedSide
  return game.pickedSide === 'home' ? 'away' : 'home'
}

export function frozenCardForBeat(
  weeks: Array<{
    week: number
    seasonYear?: number
    games: FrozenCardPick[]
  }>,
  beat: Pick<BadBeat, 'cbsEventId' | 'seasonYear' | 'week'>,
  fallbackSeason: number,
) {
  const week = weeks.find(
    (entry) =>
      entry.week === beat.week &&
      (entry.seasonYear ?? fallbackSeason) === beat.seasonYear,
  )
  return week?.games.find((game) => game.cbsEventId === beat.cbsEventId) ?? null
}

export function cardSideLabel(
  beat: Pick<BadBeat, 'away' | 'home' | 'homeSpread'>,
  game: Pick<FrozenCardPick, 'pickedSide' | 'deviated'> | null,
) {
  const side = game ? submittedCardSide(game) : null
  if (!side) return null
  const team = side === 'home' ? beat.home : beat.away
  const spread = beat.homeSpread * (side === 'away' ? -1 : 1)
  return `${team} ${formatBeatSpread(spread)}`
}

function formatBeatSpread(value: number) {
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? String(value)
    : value.toFixed(1)
  return value > 0 ? `+${points}` : points
}

export function applyBadBeatChange(
  file: BadBeatsFile,
  change: { action: 'add'; beat: BadBeat } | { action: 'remove'; key: string },
  updatedAt = new Date().toISOString(),
): BadBeatsFile {
  if (change.action === 'add') {
    const key = badBeatKey(change.beat.seasonYear, change.beat.cbsEventId)
    return {
      updatedAt,
      beats: [
        ...file.beats.filter(
          (beat) => badBeatKey(beat.seasonYear, beat.cbsEventId) !== key,
        ),
        change.beat,
      ].sort(compareBadBeats),
    }
  }

  return {
    updatedAt,
    beats: file.beats.filter(
      (beat) => badBeatKey(beat.seasonYear, beat.cbsEventId) !== change.key,
    ),
  }
}

export function compareBadBeats(left: BadBeat, right: BadBeat) {
  return (
    left.seasonYear - right.seasonYear ||
    left.week - right.week ||
    left.kickoff.localeCompare(right.kickoff) ||
    left.cbsEventId - right.cbsEventId
  )
}

export function beatsForSeason(beats: BadBeat[], seasonYear: number) {
  return beats.filter((beat) => beat.seasonYear === seasonYear)
}

const STORAGE_KEY = 'pickem-bad-beats'

type Overlay = {
  added: BadBeat[]
  removed: string[]
}

function readOverlay(): Overlay {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { added: [], removed: [] }
    const parsed = JSON.parse(raw) as Overlay
    return {
      added: Array.isArray(parsed.added) ? parsed.added : [],
      removed: Array.isArray(parsed.removed) ? parsed.removed : [],
    }
  } catch {
    return { added: [], removed: [] }
  }
}

function writeOverlay(overlay: Overlay) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay))
  } catch {
    // Private mode can block localStorage.
  }
}

export function mergeBadBeats(file: BadBeatsFile, overlay = readOverlay()) {
  const removed = new Set(overlay.removed)
  const fromFile = file.beats.filter(
    (beat) => !removed.has(badBeatKey(beat.seasonYear, beat.cbsEventId)),
  )
  const fromOverlay = overlay.added.filter(
    (beat) => !removed.has(badBeatKey(beat.seasonYear, beat.cbsEventId)),
  )
  const seen = new Set(fromOverlay.map((beat) => badBeatKey(beat.seasonYear, beat.cbsEventId)))
  return [...fromOverlay, ...fromFile.filter((beat) => !seen.has(badBeatKey(beat.seasonYear, beat.cbsEventId)))].sort(
    compareBadBeats,
  )
}

export function rememberBadBeatChange(
  change: { action: 'add'; beat: BadBeat } | { action: 'remove'; key: string },
) {
  const overlay = readOverlay()
  if (change.action === 'add') {
    const key = badBeatKey(change.beat.seasonYear, change.beat.cbsEventId)
    writeOverlay({
      added: [
        ...overlay.added.filter(
          (beat) => badBeatKey(beat.seasonYear, beat.cbsEventId) !== key,
        ),
        change.beat,
      ],
      removed: overlay.removed.filter((entry) => entry !== key),
    })
    return
  }
  writeOverlay({
    added: overlay.added.filter(
      (beat) => badBeatKey(beat.seasonYear, beat.cbsEventId) !== change.key,
    ),
    removed: [...overlay.removed.filter((entry) => entry !== change.key), change.key],
  })
}
