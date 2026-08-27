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
