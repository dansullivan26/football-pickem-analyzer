import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  badBeatAnchorId,
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

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '')
    if (!id) return
    const node = document.getElementById(id)
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [seasonYear, beats])

  const seasonBeats = beats.filter((beat) => beat.seasonYear === seasonYear)
  const [pendingClear, setPendingClear] = useState<BadBeat | null>(null)

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
                <div
                  className="history-pick bad-beat-row"
                  id={badBeatAnchorId(beat.seasonYear, beat.cbsEventId)}
                  key={badBeatRowKey(beat)}
                >
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
                    <button type="button" onClick={() => setPendingClear(beat)}>
                      Clear
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>
      {pendingClear && (
        <ClearBadBeatDialog
          beat={pendingClear}
          onCancel={() => setPendingClear(null)}
          onConfirm={() => {
            onClear(pendingClear)
            setPendingClear(null)
          }}
        />
      )}
    </main>
  )
}

function ClearBadBeatDialog({
  beat,
  onCancel,
  onConfirm,
}: {
  beat: BadBeat
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-bad-beat-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="clear-bad-beat-title">Clear this bad beat?</h2>
        <p>
          {`${beat.away} @ ${beat.home} leaves the year-end list${
            beat.note ? `, along with "${beat.note}"` : ''
          }.`}
        </p>
        <div className="confirm-dialog-actions">
          <button type="button" ref={cancelRef} onClick={onCancel}>
            Keep it
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Clear
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function BadBeatNote({
  note,
  onSave,
}: {
  note: string | null
  onSave: (note: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(note ?? '')
  }, [note, editing])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commit = (value: string) => {
    const next = value.trim() || null
    if (next !== note) onSave(next)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="bad-beat-note-text"
        onClick={() => setEditing(true)}
      >
        <span>Note</span>
        {note ? <p>{note}</p> : <p className="empty">Add a note</p>}
      </button>
    )
  }

  return (
    <label className="bad-beat-note-field">
      <span>Note</span>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={160}
        placeholder="What happened?"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(note ?? '')
            setEditing(false)
          }
        }}
      />
    </label>
  )
}

function badBeatRowKey(beat: BadBeat) {
  return `${beat.seasonYear}:${beat.cbsEventId}`
}
