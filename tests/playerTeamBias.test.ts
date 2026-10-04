import assert from 'node:assert/strict'
import test from 'node:test'
import {
  poolTeamBiasRoleLine,
  poolTeamBiasSentence,
  summarizePlayerTeamBias,
  summarizePlayerTeamResults,
  summarizePoolTeamBias,
  teamBiasSentence,
  teamBiasWarmth,
  teamResultAtsLine,
  teamResultSentence,
} from '../src/playerTeamBias.ts'
import type {
  PlayerHistory,
  PlayerPick,
  PlayerWeek,
} from '../src/types.ts'

const entryId = 'player-1'

function pick(
  id: number,
  sport: 'NFL' | 'NCAAF',
  away: string,
  home: string,
  pickedSide: 'home' | 'away' | null,
  result: PlayerPick['result'] = null,
): PlayerPick {
  return {
    gameId: `game-${id}`,
    cbsEventId: id,
    sport,
    away,
    home,
    homeSpread: -3,
    pickedTeamId: pickedSide,
    pickedTeam:
      pickedSide === 'away' ? away : pickedSide === 'home' ? home : null,
    pickedSide,
    result,
    points: null,
    pickStatus:
      result === 'win' ? 'CORRECT' : result === 'loss' ? 'INCORRECT' : null,
    matchStatus: pickedSide ? 'matched' : 'unpicked',
  }
}

function week(
  seasonYear: number,
  order: number,
  picks: PlayerPick[],
): PlayerWeek {
  return {
    week: order,
    seasonYear,
    periodId: `${seasonYear}-${order}`,
    label: `Week ${order}`,
    status: 'in_progress',
    scored: false,
    slateFile: `${seasonYear}-${order}.json`,
    entries: [
      {
        entryId,
        name: 'Player One',
        weekScore: null,
        weekRank: null,
        correctPicks: null,
        picksCount: picks.length,
        tiebreaker: { question: null, answer: null },
        picks,
      },
    ],
  }
}

function history(weeks: PlayerWeek[]): PlayerHistory {
  return {
    source: {
      fetchedAt: '2026-09-10T12:00:00Z',
      timezone: 'America/New_York',
    },
    pool: { name: 'Test', seasonYear: 2026 },
    entries: [],
    weeks,
  }
}

test('two matching picks produce an explicitly early team read', () => {
  const summary = summarizePlayerTeamBias(
    entryId,
    history([
      week(2026, 1, [pick(1, 'NFL', 'NE', 'SEA', 'away')]),
      week(2026, 2, [pick(2, 'NFL', 'NE', 'MIA', 'away')]),
    ]),
  )

  assert.equal(summary.takes.length, 1)
  assert.deepEqual(summary.takes[0], {
    key: 'NFL:NE',
    sport: 'NFL',
    abbrev: 'NE',
    direction: 'take',
    warmth: 'early',
    takes: 2,
    appearances: 2,
    rate: 1,
    seasonTakes: 2,
    seasonAppearances: 2,
  })
  assert.equal(
    teamBiasSentence(summary.takes[0]!, 'New England'),
    'Early read toward taking New England.',
  )
})

test('career signals retain a current-season split', () => {
  const weeks = [
    ...Array.from({ length: 6 }, (_, index) =>
      week(2025, index + 1, [
        pick(index + 1, 'NFL', 'IND', `OPP${index}`, 'away'),
      ]),
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      week(2026, index + 1, [
        pick(100 + index, 'NFL', 'IND', `NEW${index}`, 'away'),
      ]),
    ),
  ]
  const summary = summarizePlayerTeamBias(entryId, history(weeks), 2026)
  const colts = summary.takes.find((signal) => signal.key === 'NFL:IND')

  assert.equal(colts?.warmth, 'growing')
  assert.equal(colts?.takes, 8)
  assert.equal(colts?.appearances, 8)
  assert.equal(colts?.seasonTakes, 2)
  assert.equal(colts?.seasonAppearances, 2)
  assert.deepEqual(summary.seasons, [2025, 2026])
})

test('sport keeps identically abbreviated teams separate', () => {
  const summary = summarizePlayerTeamBias(
    entryId,
    history([
      week(2026, 1, [
        pick(1, 'NFL', 'IND', 'HOU', 'away'),
        pick(2, 'NCAAF', 'IND', 'PURDUE', 'home'),
      ]),
      week(2026, 2, [
        pick(3, 'NFL', 'IND', 'JAC', 'away'),
        pick(4, 'NCAAF', 'IND', 'MICH', 'home'),
      ]),
    ]),
  )

  assert.ok(summary.takes.some((signal) => signal.key === 'NFL:IND'))
  assert.ok(summary.fades.some((signal) => signal.key === 'NCAAF:IND'))
})

test('ordinary splits and unpicked appearances do not become bias signals', () => {
  const summary = summarizePlayerTeamBias(
    entryId,
    history([
      week(2026, 1, [
        pick(1, 'NFL', 'NE', 'SEA', 'away'),
        pick(2, 'NFL', 'NE', 'MIA', 'home'),
        pick(3, 'NFL', 'NE', 'BUF', null),
      ]),
    ]),
  )

  assert.equal(summary.takes.length, 0)
  assert.equal(summary.fades.length, 0)
})

test('warmth advances only when sample and extremity clear each bar', () => {
  assert.equal(teamBiasWarmth(2, 1), 'early')
  assert.equal(teamBiasWarmth(4, 0.75), 'signs')
  assert.equal(teamBiasWarmth(7, 0.8), 'growing')
  assert.equal(teamBiasWarmth(12, 0.85), 'established')
  assert.equal(teamBiasWarmth(12, 0.8), 'growing')
})

function poolPick(
  id: number,
  sport: 'NFL' | 'NCAAF',
  away: string,
  home: string,
  pickedSide: 'home' | 'away',
  homeSpread: number,
): PlayerPick {
  return { ...pick(id, sport, away, home, pickedSide), homeSpread }
}

function poolWeek(
  order: number,
  cards: Array<{ entryId: string; picks: PlayerPick[] }>,
  seasonYear = 2026,
): PlayerWeek {
  return {
    week: order,
    seasonYear,
    periodId: `${seasonYear}-${order}`,
    label: `Week ${order}`,
    status: 'in_progress',
    scored: false,
    slateFile: `${seasonYear}-${order}.json`,
    entries: cards.map((card) => ({
      entryId: card.entryId,
      name: card.entryId,
      weekScore: null,
      weekRank: null,
      correctPicks: null,
      picksCount: card.picks.length,
      tiebreaker: { question: null, answer: null },
      picks: card.picks,
    })),
  }
}

test('pool team bias ranks clubs after two distinct games', () => {
  const dump = history([
    poolWeek(1, [
      {
        entryId: 'a',
        picks: [poolPick(1, 'NFL', 'CHI', 'CLE', 'away', 7.5)],
      },
      {
        entryId: 'b',
        picks: [poolPick(1, 'NFL', 'CHI', 'CLE', 'away', 7.5)],
      },
    ]),
    poolWeek(2, [
      {
        entryId: 'a',
        picks: [
          poolPick(2, 'NFL', 'CHI', 'GB', 'away', 3.5),
          poolPick(3, 'NFL', 'CLE', 'BAL', 'home', 10.5),
        ],
      },
      {
        entryId: 'b',
        picks: [
          poolPick(2, 'NFL', 'CHI', 'GB', 'home', 3.5),
          poolPick(3, 'NFL', 'CLE', 'BAL', 'home', 10.5),
        ],
      },
    ]),
  ])
  const summary = summarizePoolTeamBias(dump)

  assert.equal(summary.takes[0]?.key, 'NFL:CHI')
  assert.equal(summary.takes[0]?.takes, 3)
  assert.equal(summary.takes[0]?.appearances, 4)
  assert.equal(summary.takes[0]?.games, 2)
  assert.equal(summary.takes[0]?.favoriteTakes, 3)
  assert.equal(summary.takes[0]?.favoriteAppearances, 4)
  assert.equal(summary.fades[0]?.key, 'NFL:CLE')
  assert.equal(summary.fades[0]?.games, 2)
  assert.equal(summary.fades[0]?.takes, 0)
  assert.equal(
    poolTeamBiasSentence(summary.takes[0]!, 'Chicago'),
    'The pool took Chicago on 75% of submitted cards (2 games).',
  )
  assert.equal(
    poolTeamBiasRoleLine(summary.takes[0]!),
    'as favorite 3 of 4',
  )
})

test('a one-game pile-up does not make the pool take/fade list', () => {
  const dump = history([
    poolWeek(1, [
      {
        entryId: 'a',
        picks: [poolPick(1, 'NCAAF', 'UCLA', 'UNLV', 'away', 10.5)],
      },
      {
        entryId: 'b',
        picks: [poolPick(1, 'NCAAF', 'UCLA', 'UNLV', 'away', 10.5)],
      },
    ]),
  ])
  const summary = summarizePoolTeamBias(dump)
  assert.equal(summary.takes.length, 0)
  assert.equal(summary.fades.length, 0)
})

test('pool team bias keeps favorite and dog rates on the same club', () => {
  const dump = history([
    poolWeek(1, [
      {
        entryId: 'a',
        picks: [poolPick(1, 'NFL', 'BUF', 'NYJ', 'away', 6.5)],
      },
    ]),
    poolWeek(2, [
      {
        entryId: 'a',
        picks: [poolPick(2, 'NFL', 'MIA', 'BUF', 'home', 3)],
      },
    ]),
  ])
  const bills = summarizePoolTeamBias(dump).takes.find(
    (signal) => signal.key === 'NFL:BUF',
  )
  assert.equal(bills?.favoriteTakes, 1)
  assert.equal(bills?.favoriteAppearances, 1)
  assert.equal(bills?.dogTakes, 1)
  assert.equal(bills?.dogAppearances, 1)
  assert.equal(
    poolTeamBiasRoleLine(bills!),
    'as favorite 1 of 1 · as dog 1 of 1',
  )
})

test('player team results count only the club they picked', () => {
  const summary = summarizePlayerTeamResults(
    entryId,
    history([
      week(2026, 1, [
        pick(1, 'NFL', 'KC', 'NYJ', 'away', 'win'),
        pick(2, 'NFL', 'BUF', 'MIA', 'home', 'loss'),
        pick(3, 'NFL', 'KC', 'NE', 'away', 'win'),
        pick(4, 'NFL', 'DAL', 'NYJ', 'home', 'loss'),
        pick(5, 'NFL', 'KC', 'LV', 'home', 'loss'),
      ]),
      week(2026, 2, [
        pick(6, 'NFL', 'NYJ', 'BUF', 'away', 'loss'),
        pick(7, 'NFL', 'KC', 'DEN', 'away', 'push'),
        pick(8, 'NFL', 'NYJ', 'NE', null, 'win'),
      ]),
    ]),
  )

  assert.equal(summary.wins[0]?.key, 'NFL:KC')
  assert.equal(summary.wins[0]?.wins, 2)
  assert.equal(summary.wins[0]?.losses, 0)
  assert.equal(summary.wins[0]?.pushes, 1)
  assert.equal(summary.losses[0]?.key, 'NFL:NYJ')
  assert.equal(summary.losses[0]?.losses, 2)
  assert.equal(summary.losses[0]?.wins, 0)
  assert.ok(!summary.wins.some((signal) => signal.key === 'NFL:NYG'))
  assert.ok(!summary.wins.some((signal) => signal.key === 'NFL:NE'))
  assert.equal(
    teamResultSentence(summary.wins[0]!, 'Kansas City', 'win'),
    'Won 2 times picking Kansas City.',
  )
  assert.equal(
    teamResultSentence(summary.losses[0]!, 'the Jets', 'loss'),
    'Lost 2 times picking the Jets.',
  )
  assert.equal(teamResultAtsLine(2, 0, 1), '2-0-1 ATS')
})

test('player team results keep a current-season split on career ranks', () => {
  const weeks = [
    week(2025, 1, [
      pick(1, 'NFL', 'KC', 'LV', 'away', 'win'),
      pick(2, 'NFL', 'KC', 'DEN', 'away', 'win'),
    ]),
    week(2026, 1, [
      pick(3, 'NFL', 'KC', 'NYJ', 'away', 'win'),
      pick(4, 'NFL', 'BUF', 'MIA', 'away', 'loss'),
    ]),
  ]
  const summary = summarizePlayerTeamResults(entryId, history(weeks), 2026)
  const chiefs = summary.wins.find((signal) => signal.key === 'NFL:KC')

  assert.equal(chiefs?.wins, 3)
  assert.equal(chiefs?.seasonWins, 1)
  assert.equal(chiefs?.seasonLosses, 0)
  assert.deepEqual(summary.seasons, [2025, 2026])
  assert.equal(summary.losses[0]?.key, 'NFL:BUF')
})

test('a faded cover does not count as winning with that team', () => {
  const summary = summarizePlayerTeamResults(
    entryId,
    history([
      week(2026, 1, [
        pick(1, 'NFL', 'NE', 'NYJ', 'home', 'win'),
        pick(2, 'NFL', 'MIA', 'NYJ', 'home', 'win'),
      ]),
    ]),
  )

  assert.equal(summary.wins[0]?.key, 'NFL:NYJ')
  assert.ok(!summary.wins.some((signal) => signal.key === 'NFL:NE'))
  assert.equal(summary.losses.length, 0)
})
