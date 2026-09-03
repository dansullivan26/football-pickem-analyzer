import { usStateName } from './nwsWeather.ts'
import type { GameVenue } from './types'

const STATE_TZ: Record<string, string> = {
  Alabama: 'America/Chicago',
  Alaska: 'America/Anchorage',
  Arizona: 'America/Phoenix',
  Arkansas: 'America/Chicago',
  California: 'America/Los_Angeles',
  Colorado: 'America/Denver',
  Connecticut: 'America/New_York',
  Delaware: 'America/New_York',
  'District of Columbia': 'America/New_York',
  Florida: 'America/New_York',
  Georgia: 'America/New_York',
  Hawaii: 'Pacific/Honolulu',
  Idaho: 'America/Boise',
  Illinois: 'America/Chicago',
  Indiana: 'America/Indiana/Indianapolis',
  Iowa: 'America/Chicago',
  Kansas: 'America/Chicago',
  Kentucky: 'America/New_York',
  Louisiana: 'America/Chicago',
  Maine: 'America/New_York',
  Maryland: 'America/New_York',
  Massachusetts: 'America/New_York',
  Michigan: 'America/Detroit',
  Minnesota: 'America/Chicago',
  Mississippi: 'America/Chicago',
  Missouri: 'America/Chicago',
  Montana: 'America/Denver',
  Nebraska: 'America/Chicago',
  Nevada: 'America/Los_Angeles',
  'New Hampshire': 'America/New_York',
  'New Jersey': 'America/New_York',
  'New Mexico': 'America/Denver',
  'New York': 'America/New_York',
  'North Carolina': 'America/New_York',
  'North Dakota': 'America/Chicago',
  Ohio: 'America/New_York',
  Oklahoma: 'America/Chicago',
  Oregon: 'America/Los_Angeles',
  Pennsylvania: 'America/New_York',
  'Rhode Island': 'America/New_York',
  'South Carolina': 'America/New_York',
  'South Dakota': 'America/Chicago',
  Tennessee: 'America/Chicago',
  Texas: 'America/Chicago',
  Utah: 'America/Denver',
  Vermont: 'America/New_York',
  Virginia: 'America/New_York',
  Washington: 'America/Los_Angeles',
  'West Virginia': 'America/New_York',
  Wisconsin: 'America/Chicago',
  Wyoming: 'America/Denver',
}

const STATE_ALIASES: Record<string, string> = {
  FLA: 'Florida',
  'FLA.': 'Florida',
}

const SCHOOL_TZ: Record<string, string> = {
  stanford: 'America/Los_Angeles',
  tcu: 'America/Chicago',
  'georgia tech': 'America/New_York',
  'boston college': 'America/New_York',
  'ole miss': 'America/Chicago',
  'notre dame': 'America/Indiana/Indianapolis',
  lsu: 'America/Chicago',
  unlv: 'America/Los_Angeles',
  ucla: 'America/Los_Angeles',
  smu: 'America/Chicago',
  citadel: 'America/New_York',
  'the citadel': 'America/New_York',
  marshall: 'America/New_York',
  'east carolina': 'America/New_York',
  'coastal carolina': 'America/New_York',
  'penn state': 'America/New_York',
  'boise state': 'America/Boise',
  'western michigan': 'America/Detroit',
  'central michigan': 'America/Detroit',
  pittsburgh: 'America/New_York',
  cincinnati: 'America/New_York',
  charlotte: 'America/New_York',
  toledo: 'America/New_York',
  tulsa: 'America/Chicago',
  memphis: 'America/Chicago',
  louisville: 'America/Kentucky/Louisville',
  clemson: 'America/New_York',
}

const CITY_TZ: Record<string, string> = {
  'el paso|texas': 'America/Denver',
  'pensacola|florida': 'America/Chicago',
  'panama city|florida': 'America/Chicago',
  'honolulu|hawaii': 'Pacific/Honolulu',
  'boise|idaho': 'America/Boise',
  'dublin|ie': 'Europe/Dublin',
}

const NEUTRAL_STADIUM = /aviva|nissan stadium|lambeau|wembley|tottenham|estadio azteca|deutsche bank park|allianz arena/i

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\./g, '')
}

export function timeZoneForStateName(stateName: string | null | undefined) {
  if (!stateName) return null
  return STATE_TZ[stateName] ?? null
}

export function timeZoneFromVenue(venue: GameVenue | null | undefined) {
  const city = venue?.city?.trim() ?? ''
  const state = venue?.state?.trim() ?? ''
  if (!city && !state) return null
  const stateName = usStateName(state) ?? STATE_ALIASES[state.toUpperCase()] ?? null
  const cityKey = `${normalize(city)}|${normalize(stateName ?? state)}`
  if (CITY_TZ[cityKey]) return CITY_TZ[cityKey]
  if (stateName) return timeZoneForStateName(stateName)
  if (!usStateName(state) && state.length === 2) {
    const foreign = CITY_TZ[`${normalize(city)}|${normalize(state)}`]
    if (foreign) return foreign
  }
  return null
}

export function timeZoneFromTeamLabel(label: string | null | undefined) {
  if (!label) return null
  const trimmed = label.trim()
  const asState = usStateName(trimmed)
  if (asState) return timeZoneForStateName(asState)

  const paren = trimmed.match(/\(([^)]+)\)/)
  if (paren) {
    const inner = paren[1].replace(/\./g, '').trim()
    const alias = STATE_ALIASES[inner.toUpperCase()]
    const innerState = usStateName(inner) ?? (alias ? usStateName(alias) : null)
    if (innerState) return timeZoneForStateName(innerState)
  }

  const stateSuffix = trimmed.match(/^(.*)\s+State$/i)
  if (stateSuffix) {
    const prefixState = usStateName(stateSuffix[1])
    if (prefixState) return timeZoneForStateName(prefixState)
  }

  return SCHOOL_TZ[normalize(trimmed)] ?? null
}

export function venueLooksNeutral(venue: GameVenue | null | undefined) {
  if (!venue?.city || !venue.state) return true
  if (!usStateName(venue.state)) return true
  return NEUTRAL_STADIUM.test(venue.stadium ?? '')
}

const TZ_ALIASES: Record<string, string> = {
  'America/Honolulu': 'Pacific/Honolulu',
}

function resolveTimeZone(timeZone: string) {
  return TZ_ALIASES[timeZone] ?? timeZone
}

export function timeZoneOffsetMinutes(timeZone: string, at: Date) {
  try {
    const raw = new Intl.DateTimeFormat('en-US', {
      timeZone: resolveTimeZone(timeZone),
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value
    const match = raw?.match(/([+-])(\d{1,2})(?::(\d{2}))?/)
    if (!match) return null
    const sign = match[1] === '-' ? -1 : 1
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0))
  } catch {
    return null
  }
}

export function travelZones(
  fromTimeZone: string | null,
  toTimeZone: string | null,
  at: Date,
) {
  if (!fromTimeZone || !toTimeZone) return null
  const fromId = resolveTimeZone(fromTimeZone)
  const toId = resolveTimeZone(toTimeZone)
  if (fromId === toId) {
    return { zones: 0, direction: 'same' as const }
  }
  const from = timeZoneOffsetMinutes(fromId, at)
  const to = timeZoneOffsetMinutes(toId, at)
  if (from == null || to == null) return null
  const hours = Math.round((to - from) / 60)
  if (hours === 0) return { zones: 0, direction: 'same' as const }
  return {
    zones: Math.abs(hours),
    direction: hours > 0 ? ('east' as const) : ('west' as const),
  }
}
