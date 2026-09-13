const DEFAULT_PLAYER_TIME_ZONE = 'America/Indianapolis'

export function formatPicksSnapshotAt(
  fetchedAt: string,
  timeZone = DEFAULT_PLAYER_TIME_ZONE,
) {
  const date = new Date(fetchedAt)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_PLAYER_TIME_ZONE,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date)
  }
}
