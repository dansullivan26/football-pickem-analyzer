export type Team = {
  id: string
  abbrev: string
  name: string
  nickname: string
  location: string
  conference: string
  record: string
  rank: number | null
  pickemPctStraightUp: number
  pickemPctAgainstSpread: number
}

export type SlateGame = {
  id: string
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  week: number
  status: string
  kickoff: string
  kickoffLabel: string
  tv: string | null
  away: Team
  home: Team
  homeSpread: number
  line: string
}

export type Slate = {
  source: {
    fetchedAt: string
    timezone: string
  }
  pool: {
    name: string
    seasonYear: number
    entriesCount: number
  }
  week: {
    label: string
    order: number
    gamesOnSlate: number
    ncaafGames: number
    nflGames: number
  }
  games: SlateGame[]
}

export type BookKey = 'draftkings'

export type BookLine = {
  line: number
  /** When this price was last successfully retrieved from the provider. */
  retrievedAt: string
}

export type OddsEvent = {
  cbsEventId: number | null
  sport: 'NFL' | 'NCAAF'
  kickoff: string
  awayTeam: string
  homeTeam: string
  lines: Partial<Record<BookKey, BookLine>>
}

export type OddsFeed = {
  provider: string
  updatedAt: string | null
  books: Array<{ key: BookKey; name: string }>
  events: OddsEvent[]
}

export type EdgeCategory = 'hammer' | 'lean' | 'slight' | 'neutral' | 'pending'

export type PickResult = 'win' | 'loss' | 'push' | null
export type PickMatchStatus = 'matched' | 'unpicked' | 'ambiguous' | 'unmatched'

export type PlayerPick = {
  gameId: string
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  away: string
  home: string
  homeSpread: number
  pickedTeamId: string | null
  pickedTeam: string | null
  pickedSide: 'home' | 'away' | null
  result: PickResult
  points: number | null
  pickStatus: 'NONE' | 'CORRECT' | 'INCORRECT' | null
  matchStatus: PickMatchStatus
}

export type PlayerRosterEntry = {
  entryId: string
  name: string
  hasMadeAPick: boolean
  season: {
    score: number | null
    rank: number | null
    correctPicks: number | null
    picksMadeCount: number | null
  }
}

export type PlayerWeekEntry = {
  entryId: string
  name: string
  weekScore: number | null
  weekRank: number | null
  correctPicks: number | null
  picksCount: number | null
  tiebreaker: {
    question: string
    answer: number | null
  }
  picks: PlayerPick[]
}

export type PlayerWeek = {
  week: number
  periodId: string
  label: string
  status: 'upcoming' | 'in_progress' | 'scored'
  scored: boolean
  slateFile: string
  entries: PlayerWeekEntry[]
}

export type PlayerHistory = {
  source: {
    fetchedAt: string
    timezone: string
  }
  pool: {
    name: string
    seasonYear: number
  }
  entries: PlayerRosterEntry[]
  weeks: PlayerWeek[]
}

export type CoverResult = 'home' | 'away' | 'push' | null

export type FrozenRecommendation = {
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  kickoff: string
  away: string
  home: string
  homeSpread: number
  liveHomeSpread: number | null
  category: EdgeCategory
  recommendedSide: 'home' | 'away' | null
  hook: 'fg' | 'td' | null
  cover: CoverResult
}

export type RecommendationWeek = {
  week: number
  label: string
  capturedAt: string
  scored: boolean
  games: FrozenRecommendation[]
}

export type RecommendationHistory = {
  updatedAt: string
  weeks: RecommendationWeek[]
}
