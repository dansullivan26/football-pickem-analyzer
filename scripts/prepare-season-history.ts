import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import moneyHistory from '../src/data/money-history.json' with { type: 'json' }
import { sanitizeSeasonHistory } from '../src/seasonHistory.ts'

const inputIndex = process.argv.indexOf('--input')
const inputPath =
  inputIndex >= 0
    ? process.argv[inputIndex + 1]
    : 'football-fanatics-pool-season-history.json'

if (!inputPath) {
  throw new Error(
    'Usage: npm run prepare-season-history -- --input path/to/season-history.json',
  )
}

const raw = JSON.parse(await readFile(resolve(inputPath), 'utf8'))
const history = sanitizeSeasonHistory(raw)

function nameKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

// The hand-entered money table is an independent checksum for the archive.
// Whitespace is normalized because CBS currently has "Shawn  Sedate" in the
// live roster while the supplied final standings use one space.
for (const expectedSeason of moneyHistory.seasons) {
  const actualSeason = history.seasons.find(
    (season) => season.seasonYear === expectedSeason.seasonYear,
  )
  if (!actualSeason) continue
  for (const expected of expectedSeason.places) {
    const actual = actualSeason.standings.find(
      (standing) => standing.rank === expected.place,
    )
    if (
      !actual ||
      nameKey(actual.name) !== nameKey(expected.name) ||
      actual.seasonScore !== expected.score
    ) {
      throw new Error(
        `${expectedSeason.seasonYear} ${expected.place} place must reconcile to ${expected.name} at ${expected.score}.`,
      )
    }
  }
}

const outputPath = resolve('src/data/season-history.json')
await mkdir(resolve('src/data'), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(history, null, 2)}\n`)

const weeklyRows = history.seasons.reduce(
  (total, season) =>
    total +
    season.standings.reduce(
      (seasonTotal, standing) =>
        seasonTotal + standing.weeklyWins.length,
      0,
    ),
  0,
)
console.log(
  `Prepared ${history.seasons.length} historical season(s), ${history.seasons.reduce(
    (total, season) => total + season.standings.length,
    0,
  )} standings rows, and ${weeklyRows} weekly score rows from ${inputPath}.`,
)
