import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { snapshotPlayerForecasts } from '../src/playerPrediction.ts'
import type { LastKickoffFile } from '../src/lastKickoff.ts'
import type { PlayerHistory, RecommendationHistory, Slate } from '../src/types.ts'
import type { PredictionForecasts } from '../src/playerPrediction.ts'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/prediction-forecasts.json', ROOT)

const history = JSON.parse(
  await readFile(new URL('src/data/player-history.json', ROOT), 'utf8'),
) as PlayerHistory
const recommendations = JSON.parse(
  await readFile(new URL('src/data/recommendation-history.json', ROOT), 'utf8'),
) as RecommendationHistory
const slate = JSON.parse(
  await readFile(new URL('src/data/current-slate.json', ROOT), 'utf8'),
) as Slate
let lastKickoff: LastKickoffFile | null = null
try {
  lastKickoff = JSON.parse(
    await readFile(new URL('src/data/last-kickoff.json', ROOT), 'utf8'),
  ) as LastKickoffFile
} catch {
  // Schedule ingest has not landed yet.
}

let previous: PredictionForecasts | null = null
try {
  previous = JSON.parse(await readFile(OUTPUT, 'utf8')) as PredictionForecasts
} catch {
  // First forecast snapshot.
}

const next = snapshotPlayerForecasts(
  history,
  recommendations,
  previous,
  Date.now(),
  slate,
  lastKickoff,
)

await mkdir(new URL('src/data', ROOT), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(next, null, 2)}\n`)

const current = next.weeks.at(-1)
const frozenWeeks = next.weeks.filter((week) => week.frozenAt).length
const residual = next.residuals?.overall
console.log(
  `Forecast ${current?.label ?? 'none'}: ${current?.frozenAt ? 'frozen' : 'open'} · ${frozenWeeks} frozen weeks.` +
    (residual
      ? ` Residuals ${residual.correct}/${residual.graded} graded, ${Math.round((residual.noCallRate ?? 0) * 100)}% no-call.`
      : ''),
)
