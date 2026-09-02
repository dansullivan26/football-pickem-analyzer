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

export type GameVenue = {
  stadium: string | null
  city: string | null
  state: string | null
  indoor: boolean | null
}

export type SlateTiebreaker = {
  gameId: string
  cbsEventId: number
  order: number
  type: string
  question: string
  questionId: string
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
  /** Present when the CBS dump includes a final (or in-progress) score. */
  awayScore?: number | null
  homeScore?: number | null
  /** CBS GraphQL venue. Absent on dumps from before venue was scraped. */
  venue?: GameVenue | null
  /** 1 on the weekly tiebreaker game; null on the rest. */
  tiebreakerOrder?: number | null
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
  /** CBS question attached to the one game used as the weekly tiebreaker. */
  tiebreaker?: SlateTiebreaker | null
  games: SlateGame[]
}

export type BookKey = 'draftkings'

export type BookLine = {
  line: number
  /** When this price was last successfully retrieved from the provider. */
  retrievedAt: string
  /** Home spread from the previous SharpAPI pull, if this run's number differed. */
  previousLine?: number
}

export type BookTotal = {
  line: number
  /** When this price was last successfully retrieved from the provider. */
  retrievedAt: string
  previousLine?: number
}

export type OddsEvent = {
  cbsEventId: number | null
  sport: 'NFL' | 'NCAAF'
  kickoff: string
  awayTeam: string
  homeTeam: string
  lines: Partial<Record<BookKey, BookLine>>
  /** Present only for the slate's tiebreaker game. */
  totals?: Partial<Record<BookKey, BookTotal>>
}

export type OddsFeed = {
  provider: string
  updatedAt: string | null
  /** updatedAt of the odds file this run compared against. */
  comparedTo?: string | null
  books: Array<{ key: BookKey; name: string }>
  events: OddsEvent[]
}

export type LineTick = {
  at: string
  /** DraftKings home spread. */
  home: number
}

export type TotalTick = {
  at: string
  line: number
}

export type LineHistoryGame = {
  cbsEventId: number
  ticks: LineTick[]
  /** Present only for the weekly tiebreaker. */
  totals?: TotalTick[]
}

export type LineHistory = {
  week: number
  seasonYear?: number
  label: string
  updatedAt: string
  games: LineHistoryGame[]
}

export type EdgeCategory =
  | 'lock'
  | 'hammer'
  | 'lean'
  | 'slight'
  | 'neutral'
  | 'pending'

export type GameAnalysis = {
  game: SlateGame
  odds: OddsEvent | undefined
  consensus: ConsensusGame | undefined
  liveHomeSpread: number | null
  edge: number | null
  category: EdgeCategory
  recommendedSide: 'home' | 'away' | null
}

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
    question: string | null
    answer: number | null
    gameId?: string
  }
  picks: PlayerPick[]
}

export type PlayerWeek = {
  week: number
  /** Present on archived and newly prepared weeks. Older dumps infer pool.seasonYear. */
  seasonYear?: number
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

export type ConsensusSide = {
  name: string
  abbrev: string
  coversName: string | null
  /** Current Covers "Sides" number; it may not be a number tickets used. */
  spread: number | null
  pct: number | null
  picks: number | null
}

export type ConsensusAtsLine = {
  /** Away-side spread for this Picks Per Line bucket. */
  awaySpread: number
  awayPicks: number
  homePicks: number
}

export type ConsensusGame = {
  gameId: string
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  kickoff: string
  matchStatus: 'matched' | 'unmatched'
  coversDetailsUrl: string | null
  cbsHomeSpread: number
  away: ConsensusSide
  home: ConsensusSide
  /** Optional while legacy dumps are replaced by the per-line format. */
  atsByLine?: ConsensusAtsLine[]
}

export type ConsensusReportGame = {
  cbsEventId: number | null
  gameId: string | null
  /** Prose Sides diff vs the previous dump, e.g. "TCU -9.5 (was -8.5)". */
  sides: string | null
  /** Prose ticket-share diff vs the previous dump, e.g. "TCU 64% (was 58%)". */
  pct: string | null
}

export type ConsensusReport = {
  summary: string
  /** Full chat-style blurb. Null when GrokBot only sent summary + games. */
  details: string | null
  /** fetchedAt of the dump this report compared against. */
  comparedTo: string | null
  games: ConsensusReportGame[]
}

export type ConsensusFeed = {
  source: {
    site: string
    product: string
    description: string
    fetchedAt: string
    timezone: string
  }
  week: {
    order: number
    label: string
    gamesOnSlate: number
    matched: number
    unmatched: number
  }
  /** GrokBot's vs-yesterday Sides/% blurb. Null on dumps from before report. */
  report?: ConsensusReport | null
  games: ConsensusGame[]
}

export type CoverResult = 'home' | 'away' | 'push' | null

export type FrozenRecommendation = {
  cbsEventId: number
  sport: 'NFL' | 'NCAAF'
  kickoff: string
  away: string
  home: string
  /** CBS rank the week this game was on the card. Null if unranked. Absent on older recs. */
  awayRank?: number | null
  homeRank?: number | null
  homeSpread: number
  liveHomeSpread: number | null
  category: EdgeCategory
  recommendedSide: 'home' | 'away' | null
  hook: 'fg' | 'td' | null
  cover: CoverResult
  /** Card-strategy source at freeze time. Null if the game was left unpicked. */
  source: 'line-value' | 'public-consensus' | null
  pickedSide: 'home' | 'away' | null
  strength: 'mild' | 'solid' | 'strong' | null
  score: number | null
  /** True when the completed card sent the opposite of pickedSide. */
  deviated?: boolean
  /** CBS score when the slate dump has one. Not the card-strategy `score`. */
  awayScore?: number | null
  homeScore?: number | null
}

export type FrozenTiebreaker = {
  cbsEventId: number
  /** DraftKings total at freeze (kickoff). Updates until then. */
  draftKingsTotal: number | null
  frozenAt: string | null
}

export type RecommendationWeek = {
  week: number
  seasonYear?: number
  label: string
  capturedAt: string
  scored: boolean
  tiebreaker?: FrozenTiebreaker | null
  games: FrozenRecommendation[]
}

export type RecommendationHistory = {
  updatedAt: string
  weeks: RecommendationWeek[]
}

export type CardOverrideGame = {
  gameId: string
  deviate: true
}

export type CardOverrideWeek = {
  week: number
  sentAt: string
  games: CardOverrideGame[]
}

export type CardOverrides = {
  updatedAt: string | null
  weeks: CardOverrideWeek[]
}
