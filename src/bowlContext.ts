import { mergeStaffChanges, type BowlStaffChange } from './bowlPickem.ts'
import { normalizeScheduleName } from './lastKickoff.ts'

export type CoachingSnapshotRow = {
  school: string
  firstName: string
  lastName: string
  hireDate: string | null
}

export type CoachingSnapshot = {
  seasonYear: number
  updatedAt: string | null
  coaches: CoachingSnapshotRow[]
}

export function emptyCoachingSnapshot(seasonYear: number): CoachingSnapshot {
  return { seasonYear, updatedAt: null, coaches: [] }
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function coachKey(row: Pick<CoachingSnapshotRow, 'firstName' | 'lastName'>) {
  return normalizeScheduleName(`${row.firstName} ${row.lastName}`)
}

export function staffChangeId(
  school: string,
  person: string,
  change: BowlStaffChange['change'],
  seasonYear: number,
) {
  return `${normalizeScheduleName(school)}:${normalizeScheduleName(person)}:${change}:${seasonYear}`
}

export function coachesFromCfbd(
  payload: unknown,
  seasonYear: number,
): CoachingSnapshotRow[] {
  if (!Array.isArray(payload)) return []
  const rows: CoachingSnapshotRow[] = []

  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const firstName = text(row.firstName) ?? text(row.first_name) ?? ''
    const lastName = text(row.lastName) ?? text(row.last_name) ?? ''
    if (!firstName && !lastName) continue
    const hireDate = text(row.hireDate) ?? text(row.hire_date)
    const seasons = Array.isArray(row.seasons) ? row.seasons : []
    const schools = new Set<string>()
    const topSchool = text(row.school)
    for (const season of seasons) {
      if (!season || typeof season !== 'object') continue
      const entry = season as Record<string, unknown>
      const year = Number(entry.year)
      if (Number.isFinite(year) && year !== seasonYear) continue
      const school = text(entry.school)
      if (school) schools.add(school)
    }
    if (schools.size === 0 && topSchool) {
      const year = Number(row.year)
      if (!Number.isFinite(year) || year === seasonYear) schools.add(topSchool)
    }
    for (const school of schools) {
      rows.push({ school, firstName, lastName, hireDate })
    }
  }

  rows.sort(
    (left, right) =>
      left.school.localeCompare(right.school) ||
      left.lastName.localeCompare(right.lastName),
  )
  return rows
}

export function staffChangesFromCoachSnapshots(
  previous: CoachingSnapshot | null | undefined,
  next: CoachingSnapshot,
): BowlStaffChange[] {
  if (!previous?.coaches.length || previous.seasonYear !== next.seasonYear) {
    return []
  }

  const prior = new Map(
    previous.coaches.map((row) => [normalizeScheduleName(row.school), row]),
  )
  const incoming: BowlStaffChange[] = []

  for (const coach of next.coaches) {
    const was = prior.get(normalizeScheduleName(coach.school))
    if (!was) continue
    if (coachKey(was) === coachKey(coach)) continue
    const leftName = `${was.firstName} ${was.lastName}`.trim()
    const arrivedName = `${coach.firstName} ${coach.lastName}`.trim()
    incoming.push({
      id: staffChangeId(coach.school, leftName, 'departed', next.seasonYear),
      team: coach.school,
      person: leftName,
      role: 'head-coach',
      change: 'departed',
      previousTeam: coach.school,
      destination: null,
      reportedAt: next.updatedAt,
    })
    incoming.push({
      id: staffChangeId(coach.school, arrivedName, 'hired', next.seasonYear),
      team: coach.school,
      person: arrivedName,
      role: 'head-coach',
      change: 'hired',
      previousTeam: null,
      destination: coach.school,
      reportedAt: next.updatedAt,
    })
  }

  return mergeStaffChanges([], incoming)
}

export function snapshotsEqual(
  left: CoachingSnapshot,
  right: CoachingSnapshot,
) {
  return JSON.stringify(left) === JSON.stringify(right)
}
