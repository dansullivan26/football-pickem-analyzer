import { readFile, writeFile } from 'node:fs/promises'
import { backfillNamedPlaysOnWeeks } from '../src/namedPlays.ts'

const OUTPUT = new URL('../src/data/recommendation-history.json', import.meta.url)

const history = JSON.parse(await readFile(OUTPUT, 'utf8'))
const weeks = backfillNamedPlaysOnWeeks(history.weeks)
await writeFile(OUTPUT, `${JSON.stringify({ ...history, weeks }, null, 2)}\n`)

const withWeek = weeks.filter((week) => week.playOfTheWeek).length
const dayCount = weeks.reduce(
  (total, week) => total + (week.playsOfTheDay?.length ?? 0),
  0,
)
console.log(
  `Backfilled named plays on ${withWeek} of ${weeks.length} weeks (${dayCount} plays of the day).`,
)
