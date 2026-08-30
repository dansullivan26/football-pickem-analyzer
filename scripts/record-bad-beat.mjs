import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { applyBadBeatChange } from '../src/badBeats.ts'

const OUTPUT = new URL('../src/data/bad-beats.json', import.meta.url)
const payload = JSON.parse(process.env.PAYLOAD ?? '')

if (payload.action !== 'add' && payload.action !== 'remove') {
  throw new Error('payload.action must be add or remove.')
}

if (payload.action === 'add') {
  const beat = payload.beat
  if (!beat || typeof beat !== 'object') {
    throw new Error('payload.beat is required when adding.')
  }
  if (!Number.isInteger(beat.seasonYear) || !Number.isInteger(beat.cbsEventId)) {
    throw new Error('payload.beat needs seasonYear and cbsEventId.')
  }
}

if (payload.action === 'remove' && typeof payload.key !== 'string') {
  throw new Error('payload.key is required when removing.')
}

let existing = { updatedAt: null, beats: [] }
try {
  existing = JSON.parse(await readFile(OUTPUT, 'utf8'))
} catch {
  // First bad beat.
}

const next = applyBadBeatChange(existing, payload)
await mkdir(new URL('../src/data', import.meta.url), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(next, null, 2)}\n`)
console.log(
  payload.action === 'add'
    ? `Recorded bad beat ${payload.beat.away} @ ${payload.beat.home}.`
    : `Removed bad beat ${payload.key}.`,
)
