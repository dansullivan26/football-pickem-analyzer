import { mkdir, readFile, writeFile } from 'node:fs/promises'

const OUTPUT = new URL('../src/data/card-overrides.json', import.meta.url)

const payload = JSON.parse(process.env.PAYLOAD ?? '')
if (!Number.isInteger(payload.week)) {
  throw new Error('payload.week must be an integer.')
}
if (!Array.isArray(payload.picks)) {
  throw new Error('payload.picks must be an array.')
}

const games = payload.picks
  .filter((pick) => pick.deviate === true)
  .map((pick, index) => {
    if (typeof pick.gameId !== 'string' || !pick.gameId) {
      throw new Error(`picks[${index}] is missing gameId.`)
    }
    return { gameId: pick.gameId, deviate: true }
  })

let existing = { updatedAt: null, weeks: [] }
try {
  existing = JSON.parse(await readFile(OUTPUT, 'utf8'))
} catch {
  // First completed card.
}

const sentAt = new Date().toISOString()
const next = {
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
