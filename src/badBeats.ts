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

const REPO = 'dansullivan26/football-pickem-analyzer'
const WORKFLOW = 'record-bad-beat.yml'

export async function dispatchBadBeatChange(
  change: { action: 'add'; beat: BadBeat } | { action: 'remove'; key: string },
) {
  const token = import.meta.env.VITE_GH_DISPATCH_TOKEN
  if (!token) return false

  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { payload: JSON.stringify(change) },
      }),
    },
  )

  if (response.status === 204) return true
  const detail = await response.text()
  throw new Error(
    `Could not save the bad beat (${response.status}${detail ? `: ${detail}` : ''}).`,
  )
}
