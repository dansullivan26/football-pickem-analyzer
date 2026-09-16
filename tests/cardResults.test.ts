import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decideSeasonResultsPick,
  generateSeasonResultsCard,
  resultsMaturity,
} from '../src/cardResults.ts'
import type { TeamDirectory, TeamRecord, TeamSplit } from '../src/teamPerformance.ts'
import type { GameAnalysis, SlateGame, Team } from '../src/types.ts'

function split(wins: number, losses: number): TeamSplit {
  const decided = wins + losses
  return {
    games: decided,
    wins,
    losses,
    pushes: 0,
    pending: 0,
    rate: decided ? `${Math.round((wins / decided) * 100)}%` : '—',
    detail: `${wins}-${losses}`,
  }
}

function book(abbrev: string, wins: number, losses: number): TeamRecord {
  const overall = split(wins, losses)
  const empty = split(0, 0)
  return {
    key: `NFL:${abbrev}`,
    slug: abbrev.toLowerCase(),
    sport: 'NFL',
    abbrev,
    name: abbrev,
    location: abbrev,
    nickname: abbrev,
    conference: 'AFC',
    teamId: abbrev,
    rank: null,
    appearances: [],
    overall,
    home: overall,
    away: empty,
    neutral: empty,
    favorite: overall,
    dog: empty,
    dogOutright: empty,
    benign: empty,
    adverse: empty,
    wet: empty,
    windy: empty,
    hot: empty,
    cold: empty,
    indoor: empty,
    oneZone: empty,
    twoZones: empty,
    threePlus: empty,
    shortRest: empty,
    normalRest: empty,
    longRest: empty,
    byeRest: empty,
  }
}

function team(abbrev: string): Team {
  return {
    id: `${abbrev}-id`,
    abbrev,
    name: abbrev,
    nickname: abbrev,
    location: abbrev,
    conference: 'AFC',
    record: '0-0',
    rank: null,
    pickemPctStraightUp: 50,
    pickemPctAgainstSpread: 50,
  }
}

function analysis(): GameAnalysis {
  const game: SlateGame = {
    id: 'game-id',
    cbsEventId: 1,
    sport: 'NFL',
    week: 3,
    status: 'SCHEDULED',
    kickoff: '2026-09-21T13:00:00-04:00',
    kickoffLabel: 'Sun 1:00 PM ET',
    tv: null,
    away: team('BUF'),
    home: team('NYJ'),
    homeSpread: 3,
    line: 'BUF -3',
  }
  return {
    game,
    odds: undefined,
    consensus: undefined,
    liveHomeSpread: 3,
    edge: 0,
    category: 'neutral',
    recommendedSide: null,
  }
}

test('resultsMaturity stays lean through the first few scored weeks', () => {
  assert.equal(resultsMaturity(1).key, 'too-thin')
  assert.equal(resultsMaturity(2).key, 'lean')
  assert.equal(resultsMaturity(4).key, 'developing')
  assert.equal(resultsMaturity(6).key, 'stronger')
})

test('season-results card picks the louder covered book and skips a coin flip', () => {
  const directory = {
    teams: [book('BUF', 6, 0), book('NYJ', 0, 6)],
  } as TeamDirectory
  const pick = decideSeasonResultsPick(
    analysis(),
    directory,
    undefined,
    resultsMaturity(2),
  )
  assert.equal(pick.pickedSide, 'away')
  assert.equal(pick.source, 'season-results')
  assert.match(pick.detail, /Lean sample/)

  const toss = decideSeasonResultsPick(
    analysis(),
    {
      teams: [book('BUF', 1, 1), book('NYJ', 1, 1)],
    } as TeamDirectory,
    undefined,
    resultsMaturity(2),
  )
  assert.equal(toss.pickedSide, null)
  assert.match(String(toss.skipReason), /inside the/)
})

test('generateSeasonResultsCard labels the lean sample', () => {
  const card = generateSeasonResultsCard(
    [analysis()],
    { order: 3, label: 'Week 3' },
    2026,
    null,
    { teams: [book('BUF', 6, 0), book('NYJ', 0, 6)] } as TeamDirectory,
    2,
  )
  assert.equal(card.strategyId, 'v1-season-results')
  assert.equal(card.title, 'Season-results card')
  assert.match(card.strategyNote, /Lean sample/)
  assert.equal(card.picks[0]?.pickedTeam, 'BUF')
})
