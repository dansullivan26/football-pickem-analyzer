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

export type BookKey = 'draftkings' | 'fanduel'

export type OddsEvent = {
  cbsEventId: number | null
  sport: 'NFL' | 'NCAAF'
  kickoff: string
  awayTeam: string
  homeTeam: string
  lines: Partial<Record<BookKey, number>>
}

export type OddsFeed = {
  provider: string
  updatedAt: string | null
  books: Array<{ key: BookKey; name: string }>
  events: OddsEvent[]
}

export type EdgeCategory = 'hammer' | 'lean' | 'neutral' | 'pending'
