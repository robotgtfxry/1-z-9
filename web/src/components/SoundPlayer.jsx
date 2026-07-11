import { useEffect, useRef, useState } from 'react'
import { api, SSE_URL } from '../api'

// Globalny odtwarzacz. Montowany raz w App.jsx.
// - Fetchuje liste dzwiekow z /api/sounds
// - Preladowuje kazdy plik (Audio z preload='auto')
// - Sluchacz SSE 'sound' -> odtwarza natychmiast
// - Autoplay policy: przegladarka nie zagra bez user gesture.
//   Pokazuje overlay "kliknij aby wlaczyc" dopoki nie odblokowane.

export default function SoundPlayer() {
  const audiosRef = useRef({})     // { id: HTMLAudioElement }
  const [needsUnlock, setNeedsUnlock] = useState(true)
  const [flash, setFlash] = useState(null)  // { id, label }

  // Preload wszystkich dzwiekow
  useEffect(() => {
    let alive = true
    api.sounds().then(list => {
      if (!alive) return
      const map = {}
      for (const s of list) {
        const a = new Audio(`/sounds/${s.file}`)
        a.preload = 'auto'
        a.crossOrigin = 'anonymous'
        a.load()
        a.dataset.label = s.label
        map[s.id] = a
      }
      audiosRef.current = map
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // SSE: nasluch eventu 'sound'
  useEffect(() => {
    const es = new EventSource(SSE_URL)
    const onSound = (e) => {
      try {
        const { id } = JSON.parse(e.data)
        const a = audiosRef.current[id]
        if (!a) return
        a.currentTime = 0
        a.play().catch(() => setNeedsUnlock(true))
        setFlash({ id, label: a.dataset.label })
        setTimeout(() => setFlash(null), 1400)
      } catch {}
    }
    const onStop = () => {
      for (const a of Object.values(audiosRef.current)) { try { a.pause(); a.currentTime = 0 } catch {} }
    }
    es.addEventListener('sound', onSound)
    es.addEventListener('sound-stop', onStop)
    return () => { es.removeEventListener('sound', onSound); es.removeEventListener('sound-stop', onStop); es.close() }
  }, [])

  // Odblokowanie audio na pierwszy user gesture
  const unlock = () => {
    const promises = Object.values(audiosRef.current).map(a => {
      a.muted = true
      return a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false }).catch(() => {})
    })
    Promise.allSettled(promises).then(() => setNeedsUnlock(false))
  }

  return (
    <>
      {needsUnlock && (
        <button className="sound-unlock" onClick={unlock}
                title="Kliknij aby zezwolic przegladarce na odtwarzanie dzwiekow">
          Kliknij, aby wlaczyc dzwieki
        </button>
      )}
      {flash && (
        <div className="sound-flash" aria-live="polite">
          <span className="sound-flash-dot" /> {flash.label}
        </div>
      )}
    </>
  )
}
