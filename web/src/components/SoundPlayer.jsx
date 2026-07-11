import { useEffect, useRef, useState } from 'react'
import { api, SSE_URL } from '../api'

// Globalny odtwarzacz. Montowany raz w App.jsx.
// - Fetchuje /api/sounds (9 slotow z present true/false)
// - Preladowuje audio dla slotow z present=true (URL: /sound/:slot)
// - Sluchacz SSE 'sound' -> odtwarza natychmiast

export default function SoundPlayer() {
  const audiosRef = useRef({})     // { id: HTMLAudioElement }
  const [needsUnlock, setNeedsUnlock] = useState(true)
  const [flash, setFlash] = useState(null)

  // Preload (odswiezany co 5 s bo Tkinter moze podmienic sloty)
  useEffect(() => {
    let alive = true
    const load = () => {
      api.sounds().then(list => {
        if (!alive) return
        const cur = audiosRef.current
        // usun stare
        for (const key of Object.keys(cur)) {
          if (!list.find(s => s.id === key && s.present)) delete cur[key]
        }
        // dodaj nowe
        for (const s of list) {
          if (!s.present) continue
          if (!cur[s.id]) {
            const a = new Audio(`/sound/${s.slot}`)
            a.preload = 'auto'
            a.crossOrigin = 'anonymous'
            a.load()
            cur[s.id] = a
          }
        }
      }).catch(() => {})
    }
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // SSE
  useEffect(() => {
    const es = new EventSource(SSE_URL)
    const onSound = (e) => {
      try {
        const { id } = JSON.parse(e.data)
        const a = audiosRef.current[id]
        if (!a) return
        a.currentTime = 0
        a.play().catch(() => setNeedsUnlock(true))
        setFlash({ id })
        setTimeout(() => setFlash(null), 1200)
      } catch {}
    }
    const onStop = () => {
      for (const a of Object.values(audiosRef.current)) { try { a.pause(); a.currentTime = 0 } catch {} }
    }
    es.addEventListener('sound', onSound)
    es.addEventListener('sound-stop', onStop)
    return () => { es.removeEventListener('sound', onSound); es.removeEventListener('sound-stop', onStop); es.close() }
  }, [])

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
        <button className="sound-unlock" onClick={unlock}>
          Kliknij, aby wlaczyc dzwieki
        </button>
      )}
      {flash && (
        <div className="sound-flash" aria-live="polite">
          <span className="sound-flash-dot" /> Dzwiek {flash.id}
        </div>
      )}
    </>
  )
}
