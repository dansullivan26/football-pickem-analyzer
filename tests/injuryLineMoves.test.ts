import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dkLineThisPull,
  filterInjuryLineEventsToListedStarters,
  formatInjuryLineEvent,
  injuryLineEventsForGame,
  towardTeamDelta,
  updateInjuryLineHistory,
  type InjuryLineHistory,
} from '../src/injuryLineMoves.ts'
import type { NflStarterInjuryFile } from '../src/nflStarterInjuries.ts'
import type { OddsEvent, Slate } from '../src/types.ts'

const slate = {
  pool: { seasonYear: 2026 },
  week: { order: 3, label: 'Week 3' },
  games: [
    {
      cbsEventId: 99,
      sport: 'NFL',
      away: { abbrev: 'KC', name: 'Kansas City' },
      home: { abbrev: 'BUF', name: 'Buffalo' },
    },
  ],
} as unknown as Slate

function injuries(
  status: string,
  tier: 'questionable' | 'doubtful' | 'out',
): NflStarterInjuryFile {
  return {
    source: {
      provider: 'ESPN',
      fetchedAt: '2026-09-17T03:00:00.000Z',
      reportUpdatedAt: null,
      note: '',
    },
    teams: [
      {
        abbrev: 'KC',
        name: 'Kansas City',
        espnTeamId: '12',
        depthChartAt: null,
        status: 'ok',
        injuries: [
          {
            athleteId: '3139477',
            name: 'Patrick Mahomes',
            position: 'QB',
            status,
            tier,
            injury: 'Knee',
            detail: null,
            updatedAt: '2026-09-17T02:00:00Z',
          },
        ],
      },
    ],
  }
}

function odds(line: number, previousLine?: number): OddsEvent[] {
  return [
    {
      cbsEventId: 99,
      sport: 'NFL',
      kickoff: '2026-09-17T20:20:00Z',
      awayTeam: 'Kansas City',
      homeTeam: 'Buffalo',
      lines: {
        draftkings: {
          line,
          retrievedAt: '2026-09-17T03:16:00.000Z',
          ...(previousLine != null ? { previousLine } : {}),
        },
      },
    },
  ]
}

test('towardTeamDelta is positive when DraftKings shortens that side', () => {
  assert.equal(towardTeamDelta(-3, -1.5, 'away'), 1.5)
  assert.equal(towardTeamDelta(-3, -1.5, 'home'), -1.5)
  assert.equal(towardTeamDelta(-3, -7, 'away'), -4)
})

test('dkLineThisPull uses previousLine only when this hourly print moved', () => {
  assert.deepEqual(dkLineThisPull(odds(-7, -3)[0]), { before: -3, after: -7 })
  assert.deepEqual(dkLineThisPull(odds(-3)[0]), { before: -3, after: -3 })
})

test('Mahomes Q to D with a same-hour DK move against Kansas City', () => {
  const history = updateInjuryLineHistory({
    previousHistory: null,
    previousInjuries: injuries('Questionable', 'questionable'),
    nextInjuries: injuries('Doubtful', 'doubtful'),
    slate,
    events: odds(-7, -3),
    runAt: '2026-09-17T03:16:23.590Z',
  })
  const event = history.games[0]?.events[0]
  assert.equal(event?.name, 'Patrick Mahomes')
  assert.equal(event?.fromStatus, 'Questionable')
  assert.equal(event?.toStatus, 'Doubtful')
  assert.equal(event?.availability, 'worse')
  assert.equal(event?.homeSpreadBefore, -3)
  assert.equal(event?.homeSpreadAfter, -7)
  assert.equal(event?.towardTeam, -4)
  assert.equal(
    formatInjuryLineEvent(event!),
    'Patrick Mahomes (KC QB) Questionable → Doubtful. DraftKings moved 4 toward the home team on the same hourly pull (-3 → -7 home).',
  )
})

test('records a status change even when DraftKings did not move', () => {
  const history = updateInjuryLineHistory({
    previousHistory: null,
    previousInjuries: injuries('Questionable', 'questionable'),
    nextInjuries: injuries('Doubtful', 'doubtful'),
    slate,
    events: odds(-3),
    runAt: '2026-09-17T03:16:23.590Z',
  })
  assert.equal(
    formatInjuryLineEvent(history.games[0].events[0]),
    'Patrick Mahomes (KC QB) Questionable → Doubtful. DraftKings unchanged on that pull (-3 home).',
  )
})

test('cleared starters count as better availability', () => {
  const history = updateInjuryLineHistory({
    previousHistory: null,
    previousInjuries: injuries('Out', 'out'),
    nextInjuries: {
      source: injuries('Out', 'out').source,
      teams: [
        {
          ...injuries('Out', 'out').teams[0],
          injuries: [],
        },
      ],
    },
    slate,
    events: odds(-3, -7),
    runAt: '2026-09-17T04:16:00.000Z',
  })
  const event = history.games[0].events[0]
  assert.equal(event.toStatus, null)
  assert.equal(event.availability, 'better')
  assert.equal(event.towardTeam, 4)
})

test('ignores comment-only ESPN updates that keep the same tier', () => {
  const history = updateInjuryLineHistory({
    previousHistory: null,
    previousInjuries: injuries('Questionable', 'questionable'),
    nextInjuries: injuries('Questionable', 'questionable'),
    slate,
    events: odds(-7, -3),
    runAt: '2026-09-17T03:16:23.590Z',
  })
  assert.equal(history.games.length, 0)
})

test('leaves the history file untouched when ESPN statuses did not change', () => {
  const previous: InjuryLineHistory = {
    week: 3,
    seasonYear: 2026,
    label: 'Week 3',
    updatedAt: '2026-09-17T01:00:00.000Z',
    note: 'keep',
    games: [],
  }
  const history = updateInjuryLineHistory({
    previousHistory: previous,
    previousInjuries: injuries('Questionable', 'questionable'),
    nextInjuries: injuries('Questionable', 'questionable'),
    slate,
    events: odds(-7, -3),
    runAt: '2026-09-17T03:16:23.590Z',
  })
  assert.equal(history.updatedAt, '2026-09-17T01:00:00.000Z')
  assert.equal(history.note, 'keep')
})

test('a new slate week drops last week’s coincidences', () => {
  const previous: InjuryLineHistory = {
    week: 2,
    seasonYear: 2026,
    label: 'Week 2',
    updatedAt: '2026-09-10T03:00:00.000Z',
    note: '',
    games: [
      {
        cbsEventId: 99,
        events: [
          {
            at: '2026-09-10T03:00:00.000Z',
            cbsEventId: 99,
            athleteId: '1',
            name: 'Old',
            position: 'QB',
            teamAbbrev: 'KC',
            teamName: 'Kansas City',
            side: 'away',
            fromStatus: 'Questionable',
            toStatus: 'Out',
            fromTier: 'questionable',
            toTier: 'out',
            availability: 'worse',
            homeSpreadBefore: -3,
            homeSpreadAfter: -7,
            towardTeam: -4,
          },
        ],
      },
    ],
  }
  const history = updateInjuryLineHistory({
    previousHistory: previous,
    previousInjuries: injuries('Questionable', 'questionable'),
    nextInjuries: injuries('Questionable', 'questionable'),
    slate,
    events: odds(-3),
    runAt: '2026-09-17T03:16:23.590Z',
  })
  assert.equal(history.week, 3)
  assert.equal(history.games.length, 0)
  assert.equal(injuryLineEventsForGame(previous, 99, 3, 2026).length, 0)
})

test('same-hour DK rows keep only names still on the first-team injury table', () => {
  const events: InjuryLineHistory['games'][number]['events'] = [
    {
      at: '2026-09-17T03:16:23.590Z',
      cbsEventId: 99,
      athleteId: '3139477',
      name: 'Patrick Mahomes',
      position: 'QB',
      teamAbbrev: 'KC',
      teamName: 'Kansas City',
      side: 'away',
      fromStatus: 'Questionable',
      toStatus: 'Doubtful',
      fromTier: 'questionable',
      toTier: 'doubtful',
      availability: 'worse',
      homeSpreadBefore: -3,
      homeSpreadAfter: -7,
      towardTeam: -4,
    },
    {
      at: '2026-09-18T00:29:57.568Z',
      cbsEventId: 99,
      athleteId: '999',
      name: 'Backup Safety',
      position: 'S',
      teamAbbrev: 'KC',
      teamName: 'Kansas City',
      side: 'away',
      fromStatus: null,
      toStatus: 'Questionable',
      fromTier: null,
      toTier: 'questionable',
      availability: 'worse',
      homeSpreadBefore: -3,
      homeSpreadAfter: -3,
      towardTeam: 0,
    },
  ]
  const visible = filterInjuryLineEventsToListedStarters(
    events,
    injuries('Doubtful', 'doubtful'),
    ['KC', 'BUF'],
  )
  assert.deepEqual(
    visible.map((event) => event.name),
    ['Patrick Mahomes'],
  )
})
