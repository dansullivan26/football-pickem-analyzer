import { useEffect } from 'react'
import {
  formatBadBeatDate,
  youtubeSearchUrl,
  type BadBeat,
} from './badBeats'
import { pathForView } from './routes'

function formatSpread(value: number) {
  if (value === 0) return 'PK'
  const points = Number.isInteger(Math.abs(value))
    ? String(value)
    : value.toFixed(1)
  return value > 0 ? `+${points}` : points
}

export default function BadBeatsView({
  seasonYear,
  beats,
  onClear,
  onBackToTeams,
}: {
  seasonYear: number
  beats: BadBeat[]
  onClear: (beat: BadBeat) => void
  onBackToTeams: () => void
}) {
  useEffect(() => {
    const previous = document.title
    document.title = 'Bad beats · Pick\'em Edge'
    return () => {
      document.title = previous
    }
  }, [])

  const seasonBeats = beats.filter((beat) => beat.seasonYear === seasonYear)

  return (
    <main>
      <section className="hero players-hero">
        <div>
          <p className="eyebrow">Display only</p>
          <h1>Bad beats</h1>
          <p className="hero-copy">
            Real ATS losses that still hurt. Nothing here changes
            rankings, habits, or the pool score. Open the YouTube
            search in December and laugh.
          </p>
        </div>
        <div className="week-chip">
          <span>{seasonYear} stamps</span>
          <strong>{seasonBeats.length}</strong>
          <small>
            {beats.length} all-time
          </small>
        </div>
      </section>

      <section className="week-card">
        <div className="week-card-heading">
          <div>
            <span>Year in review</span>
            <strong>{seasonYear}</strong>
          </div>
          <a
            href={pathForView('teams')}
            onClick={(event) => {
              event.preventDefault()
              onBackToTeams()
            }}
          >
            Back to Teams
          </a>
        </div>
        <div className="pick-history-list">
          {seasonBeats.length === 0 ? (
            <p className="team-empty">
              No bad beats stamped this season. Mark one from a
              team appearance or the frozen card.
            </p>
          ) : (
            seasonBeats.map((beat) => (
              <div className="history-pick" key={badBeatRowKey(beat)}>
                <div className="history-matchup">
                  <span>
                    {beat.weekLabel}
                    {' · '}
                    <time dateTime={beat.kickoff}>
                      {formatBadBeatDate(beat.kickoff)}
                    </time>
                  </span>
                  <strong>
                    {beat.away} @ {beat.home}
                  </strong>
                  <small>
                    CBS {beat.home} {formatSpread(beat.homeSpread)}
                    {beat.note ? ` · ${beat.note}` : ''}
                  </small>
                </div>
                <div className="bad-beat-actions">
                  <span className="bad-beat-chip">Bad beat</span>
                  <a
                    href={youtubeSearchUrl(beat)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watch
                  </a>
                  <button type="button" onClick={() => onClear(beat)}>
                    Clear
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  )
}

function badBeatRowKey(beat: BadBeat) {
  return `${beat.seasonYear}:${beat.cbsEventId}`
}
