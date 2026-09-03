export type InjuryTeam = {
  sport: 'NFL' | 'NCAAF'
  abbrev: string
  location?: string | null
  nickname?: string | null
}

export function cbsInjurySlug(location: string, nickname: string) {
  return `${location} ${nickname}`
    .replace(/['’.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type CbsTeamPage = 'injuries' | 'schedule'

export function cbsTeamPageUrl(team: InjuryTeam, page: CbsTeamPage) {
  const abbrev = team.abbrev.trim()
  const location = team.location?.trim() ?? ''
  const nickname = team.nickname?.trim() ?? ''
  if (!abbrev || !location || !nickname) return null
  const league = team.sport === 'NFL' ? 'nfl' : 'college-football'
  return `https://www.cbssports.com/${league}/teams/${abbrev}/${cbsInjurySlug(location, nickname)}/${page}/`
}

export function cbsInjuryUrl(team: InjuryTeam) {
  return cbsTeamPageUrl(team, 'injuries')
}

export function cbsScheduleUrl(team: InjuryTeam) {
  return cbsTeamPageUrl(team, 'schedule')
}
