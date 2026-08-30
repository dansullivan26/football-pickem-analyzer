import { useEffect } from 'react'
import {
  cardSideLabel,
  formatBadBeatDate,
  frozenCardForBeat,
  youtubeSearchUrl,
  type BadBeat,
} from './badBeats'
import type { RecommendationHistory } from './types'

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
  recommendations,
  onClear,
  onUpdateNote,
}: {
  seasonYear: number
  beats: BadBeat[]
  recommendations: RecommendationHistory
  onClear: (beat: BadBeat) => void
  onUpdateNote: (beat: BadBeat, note: string | null) => void
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
            rankings, habits, or the pool score. Add a note when you
            remember why, then open the YouTube search in December.
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
        </div>
        <div className="pick-history-list">
          {seasonBeats.length === 0 ? (
            <p className="team-empty">
              No bad beats stamped this season. Mark one from a
              team appearance or the frozen card.
            </p>
          ) : (
            seasonBeats.map((beat) => {
              const cardSide = cardSideLabel(
                beat,
                frozenCardForBeat(recommendations.weeks, beat, seasonYear),
              )
              return (
                <div className="history-pick bad-beat-row" key={badBeatRowKey(beat)}>
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
                      {cardSide ? ` · we had ${cardSide}` : ''}
                    </small>
                  </div>
                  <BadBeatNote
                    note={beat.note}
                    onSave={(note) => onUpdateNote(beat, note)}
                  />
                  <div className="bad-beat-actions">
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
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}

function BadBeatNote({
  note,
  onSave,
}: {
  note: string | null
  onSave: (note: string | null) => void
}) {
  const commit = (value: string) => {
    const next = value.trim() || null
    if (next !== note) onSave(next)
  }

  return (
    <label className="bad-beat-note-field">
      <span>Note</span>
      <input
        type="text"
        defaultValue={note ?? ''}
        maxLength={160}
        placeholder="What happened?"
        onChange={(event) => commit(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = note ?? ''
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

function badBeatRowKey(beat: BadBeat) {
  return `${beat.seasonYear}:${beat.cbsEventId}`
}
