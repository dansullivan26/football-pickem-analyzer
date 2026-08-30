import { useEffect, useId, useRef, useState } from 'react'
import { type BadBeat } from './badBeats'

export default function BadBeatMenu({
  beat,
  onMark,
  onClear,
}: {
  beat?: BadBeat
  onMark: () => void
  onClear: (beat: BadBeat) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={`bad-beat-menu${beat ? ' stamped' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="bad-beat-menu-trigger"
        aria-label={beat ? 'Bad beat options' : 'More options'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      {open && (
        <div className="bad-beat-menu-panel" id={menuId} role="menu">
          {beat ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClear(beat)
                setOpen(false)
              }}
            >
              Clear bad beat
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMark()
                setOpen(false)
              }}
            >
              Mark bad beat
            </button>
          )}
        </div>
      )}
    </div>
  )
}
