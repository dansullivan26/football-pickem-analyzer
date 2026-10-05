import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  applyCfbdBowlNames,
  type CfbdBowlGame,
} from '../src/bowlOdds.ts'
import {
  coachesFromCfbd,
  emptyCoachingSnapshot,
  staffChangesFromCoachSnapshots,
  type CoachingSnapshot,
} from '../src/bowlContext.ts'
import {
  emptyBowlPickem,
  filesEqualForWrite,
  mergeStaffChanges,
  type BowlPickemFile,
} from '../src/bowlPickem.ts'
import type { Slate } from '../src/types.ts'

const ROOT = new URL('../', import.meta.url)
const CFBD_BASE = 'https://api.collegefootballdata.com'
const BOWL_OUTPUT = new URL('src/data/bowl-pickem.json', ROOT)
const COACH_OUTPUT = new URL('src/data/coaching-snapshot.json', ROOT)

const slate = JSON.parse(
  await readFile(new URL('src/data/current-slate.json', ROOT), 'utf8'),
) as Slate

const seasonYear = slate.pool.seasonYear
const apiKey = process.env.CFBD_API_KEY?.trim() ?? ''
const runAt = new Date().toISOString()

let previousBowl: BowlPickemFile = emptyBowlPickem(seasonYear)
try {
  previousBowl = JSON.parse(await readFile(BOWL_OUTPUT, 'utf8')) as BowlPickemFile
} catch {
  // First bowl file.
}

let previousCoaches: CoachingSnapshot = emptyCoachingSnapshot(seasonYear)
try {
  previousCoaches = JSON.parse(
    await readFile(COACH_OUTPUT, 'utf8'),
  ) as CoachingSnapshot
} catch {
  // First coaching snapshot.
}

if (!apiKey) {
  console.warn(
    'CFBD_API_KEY is not set — keeping the previous coaching snapshot and bowl names. Get a free key at https://collegefootballdata.com/key.',
  )
} else {
  try {
    await snapshotBowlContext()
  } catch (error) {
    console.warn(
      'Bowl context snapshot missed this run:',
      error instanceof Error ? error.message : error,
    )
  }
}

async function snapshotBowlContext() {
  const coachesPayload = await cfbdJson(apiKey, `/coaches?year=${seasonYear}`)
  const nextCoaches: CoachingSnapshot = {
    seasonYear,
    updatedAt: runAt,
    coaches: coachesFromCfbd(coachesPayload, seasonYear),
  }
  const coachesChanged =
    previousCoaches.seasonYear !== nextCoaches.seasonYear ||
    JSON.stringify(previousCoaches.coaches) !== JSON.stringify(nextCoaches.coaches)
  const staffChanges = coachesChanged
    ? staffChangesFromCoachSnapshots(previousCoaches, nextCoaches)
    : []

  const postseason = asRecords(
    await cfbdJson(apiKey, `/games?year=${seasonYear}&seasonType=postseason`),
  ) as CfbdBowlGame[]
  const games = applyCfbdBowlNames(previousBowl.games, postseason)
  const namesChanged = games.some(
    (game, index) => game.bowlName !== previousBowl.games[index]?.bowlName,
  )
  const nextBowl: BowlPickemFile = {
    ...previousBowl,
    seasonYear,
    games,
    staffChanges: mergeStaffChanges(previousBowl.staffChanges, staffChanges),
    updatedAt:
      staffChanges.length || namesChanged ? runAt : previousBowl.updatedAt,
  }

  await mkdir(new URL('src/data', ROOT), { recursive: true })

  if (coachesChanged) {
    await writeFile(COACH_OUTPUT, `${JSON.stringify(nextCoaches, null, 2)}\n`)
    console.log(
      `Coaching snapshot ${seasonYear}: ${nextCoaches.coaches.length} head coaches` +
        (staffChanges.length ? ` · ${staffChanges.length} move(s).` : '.'),
    )
  } else {
    console.log(
      `Coaching snapshot ${seasonYear}: ${previousCoaches.coaches.length} head coaches — unchanged.`,
    )
  }

  if (!filesEqualForWrite(previousBowl, nextBowl)) {
    await writeFile(BOWL_OUTPUT, `${JSON.stringify(nextBowl, null, 2)}\n`)
    console.log(
      `Bowl context: ${nextBowl.games.filter((game) => game.bowlName).length}/${nextBowl.games.length} named, ${nextBowl.staffChanges.length} staff row(s).`,
    )
  } else {
    console.log('Bowl context unchanged.')
  }
}

async function cfbdJson(key: string, path: string) {
  const response = await fetch(`${CFBD_BASE}${path}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${key}`,
      'user-agent': 'football-pickem-analyzer bowl-context',
    },
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'CFBD rejected the key. Confirm CFBD_API_KEY from https://collegefootballdata.com/key',
    )
  }
  if (!response.ok) {
    throw new Error(`CFBD ${path} failed: ${response.status}`)
  }
  return response.json()
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}
