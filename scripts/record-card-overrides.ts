import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { mergeOverrideGames } from '../src/cardOverrides.ts'
import type { CardOverrides } from '../src/types.ts'

const OUTPUT = new URL('../src/data/card-overrides.json', import.meta.url)

const payload = JSON.parse(process.env.PAYLOAD ?? '')
if (!Number.isInteger(payload.week)) {
  throw new Error('payload.week must be an integer.')
}
if (!Array.isArray(payload.picks)) {
  throw new Error('payload.picks must be an array.')
}

let existing: CardOverrides = { updatedAt: null, weeks: [] }
try {
  existing = JSON.parse(await readFile(OUTPUT, 'utf8')) as CardOverrides
} catch {
  // First completed card.
}

const previous = existing.weeks.find((week) => week.week === payload.week)
const games = mergeOverrideGames(previous?.games, payload.picks)
const sentAt = new Date().toISOString()
const next: CardOverrides = {
  updatedAt: sentAt,
  weeks: [
    ...(existing.weeks ?? []).filter((week) => week.week !== payload.week),
    { week: payload.week, sentAt, games },
  ].sort((left, right) => left.week - right.week),
}

await mkdir(new URL('../src/data', import.meta.url), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(next, null, 2)}\n`)
console.log(
  `Recorded week ${payload.week}: ${games.length} deviation${games.length === 1 ? '' : 's'}.`,
)
