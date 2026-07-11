import { useEffect, useRef, useState } from 'react'

// Przycisk wymagajacy przytrzymania przez `duration` ms, zeby wywolac akcje.
// Puszczenie wczesniej -> anuluje.
// Wizualnie: pasek postepu wypelnia sie od lewej.
export default function HoldButton({ onConfirm, children, duration = 2000, className = '', hint = 'Przytrzymaj 2s' }) {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef(null)
  const startRef = useRef(0)
  const doneRef = useRef(false)

  const cancel = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setProgress(0)
    doneRef.current = false
  }

  const start = (e) => {
    e.preventDefault()
    if (rafRef.current) return
    startRef.current = performance.now()
    doneRef.current = false
    const tick = () => {
      const elapsed = performance.now() - startRef.current
      const p = Math.min(elapsed / duration, 1)
      setProgress(p)
      if (p >= 1) {
        if (!doneRef.current) { doneRef.current = true; onConfirm?.() }
        cancel()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => cancel(), [])

  return (
    <button
      className={`hold-btn ${className}`}
      style={{ '--hb-progress': `${progress * 100}%` }}
      onMouseDown={start}   onMouseUp={cancel}   onMouseLeave={cancel}
      onTouchStart={start}  onTouchEnd={cancel}  onTouchCancel={cancel}
      onContextMenu={e => e.preventDefault()}
      title={hint}
    >
      <span className="hold-btn-label">{children}</span>
      <span className="hold-btn-hint">{hint}</span>
    </button>
  )
}
