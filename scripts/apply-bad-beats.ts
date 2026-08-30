import { readFile, writeFile } from 'node:fs/promises'
import { applyBadBeatChange, type BadBeat, type BadBeatsFile } from '../src/badBeats.ts'

const OUTPUT = new URL('../src/data/bad-beats.json', import.meta.url)

function readBeat(raw: unknown): BadBeat {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('payload.beat must be an object.')
  }
  const beat = raw as Record<string, unknown>
  if (!Number.isInteger(beat.seasonYear) || !Number.isInteger(beat.week)) {
    throw new Error('beat.seasonYear and beat.week must be integers.')
  }
  if (!Number.isInteger(beat.cbsEventId) || !Number.isFinite(beat.homeSpread)) {
    throw new Error('beat.cbsEventId must be an integer and homeSpread a number.')
  }
  for (const key of ['weekLabel', 'kickoff', 'away', 'home', 'markedAt'] as const) {
    if (typeof beat[key] !== 'string' || !beat[key]) {
      throw new Error(`beat.${key} must be a non-empty string.`)
    }
  }
  if (beat.note != null && typeof beat.note !== 'string') {
    throw new Error('beat.note must be a string or null.')
  }
  return {
    seasonYear: beat.seasonYear as number,
    week: beat.week as number,
    weekLabel: beat.weekLabel as string,
    cbsEventId: beat.cbsEventId as number,
    kickoff: beat.kickoff as string,
    away: beat.away as string,
    home: beat.home as string,
    homeSpread: beat.homeSpread as number,
    note: typeof beat.note === 'string' ? beat.note : null,
    markedAt: beat.markedAt as string,
  }
}

const payload = JSON.parse(process.env.PAYLOAD ?? '')
let file: BadBeatsFile = { updatedAt: null, beats: [] }
try {
  const parsed = JSON.parse(await readFile(OUTPUT, 'utf8')) as BadBeatsFile
  file = {
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    beats: Array.isArray(parsed.beats) ? parsed.beats : [],
  }
} catch {
  // First published stamp.
}

const next =
  payload.action === 'add'
    ? applyBadBeatChange(file, { action: 'add', beat: readBeat(payload.beat) })
    : payload.action === 'remove'
      ? applyBadBeatChange(file, {
          action: 'remove',
          key: String(payload.key ?? ''),
        })
      : null

if (!next) throw new Error('payload.action must be add or remove.')
if (payload.action === 'remove' && !payload.key) {
  throw new Error('payload.key is required to remove a bad beat.')
}

await writeFile(OUTPUT, `${JSON.stringify(next, null, 2)}\n`)
console.log(
  payload.action === 'add'
    ? `Recorded bad beat ${payload.beat.away} @ ${payload.beat.home}.`
    : `Cleared bad beat ${payload.key}.`,
)
