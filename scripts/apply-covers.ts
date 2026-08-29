import { readFile, writeFile } from 'node:fs/promises'
import {
  applyCoversToRecommendations,
  coversFromPlayerHistory,
} from '../src/coverResults.ts'
import type { PlayerHistory, RecommendationHistory } from '../src/types.ts'

const ROOT = new URL('../', import.meta.url)
const OUTPUT = new URL('src/data/recommendation-history.json', ROOT)

const history = JSON.parse(
  await readFile(new URL('src/data/player-history.json', ROOT), 'utf8'),
) as PlayerHistory
const recommendations = JSON.parse(
  await readFile(OUTPUT, 'utf8'),
) as RecommendationHistory

const covers = coversFromPlayerHistory(history)
const { next, applied } = applyCoversToRecommendations(recommendations, covers)

if (applied === 0) {
  console.log('No new Performance covers from player results.')
} else {
  await writeFile(OUTPUT, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`Recorded ${applied} Performance cover${applied === 1 ? '' : 's'} from player results.`)
}
