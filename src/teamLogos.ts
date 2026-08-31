const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(input: string): string | null {
  let bits = 0
  let value = 0
  let output = ''

  for (const char of input.toUpperCase().replace(/=+$/, '')) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bits -= 8
      output += String.fromCharCode((value >>> bits) & 0xff)
    }
  }

  return output
}

/** Slate team ids are base32 of "Team:<cbsTeamNumber>", which CBS also uses for logo assets. */
export function cbsTeamLogoUrl(teamId: string): string | null {
  const cbsTeamNumber = decodeBase32(teamId)?.match(/^Team:(\d+)$/)?.[1]
  return cbsTeamNumber
    ? `https://sports.cbsimg.net/fly/images/team-logos/light/${cbsTeamNumber}.svg`
    : null
}

const LIGHT_LUMINANCE = 0.82
const PAINT = /(?:fill|stroke)\s*[:=]\s*["']?([^"';\s]+)/gi
const backdropCache = new Map<string, Promise<boolean>>()

function hexLuminance(hex: string) {
  let value = hex.replace('#', '')
  if (value.length === 3) value = value.split('').map((part) => part + part).join('')
  if (value.length === 8) value = value.slice(0, 6)
  if (value.length !== 6) return null
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) return null
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
}

function paintLuminance(raw: string) {
  const paint = raw.trim().toLowerCase()
  if (!paint || paint === 'none' || paint === 'transparent' || paint.startsWith('url(')) {
    return null
  }
  if (paint === 'white') return 1
  if (paint === 'black') return 0
  if (paint.startsWith('#')) return hexLuminance(paint)
  const rgb = paint.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!rgb) return null
  return (
    (0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3])) /
    255
  )
}

/** True when every painted fill/stroke would vanish on a white page. */
export function svgNeedsDarkBackdrop(svg: string) {
  const paints: number[] = []
  for (const match of svg.matchAll(PAINT)) {
    const luminance = paintLuminance(match[1] ?? '')
    if (luminance != null) paints.push(luminance)
  }
  return paints.length > 0 && paints.every((value) => value >= LIGHT_LUMINANCE)
}

export function darkBackdropForLogoUrl(url: string) {
  const existing = backdropCache.get(url)
  if (existing) return existing
  const pending = fetch(url)
    .then((response) => (response.ok ? response.text() : ''))
    .then((svg) => (svg ? svgNeedsDarkBackdrop(svg) : false))
    .catch(() => false)
  backdropCache.set(url, pending)
  return pending
}
