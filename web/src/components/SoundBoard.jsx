import { useEffect, useState } from 'react'
import { api } from '../api'

// 9 przyciskow numerowanych 1..9. Sloty konfiguruje operator w launcherze
// (Tkinter). Puste sloty sa disabled. Skrot: klawisze 1..9 na klawiaturze.

export default function SoundBoard() {
  const [items, setItems] = useState([])
  const [err, setErr] = useState(null)
  const [last, setLast] = useState(null)

  const refresh = () => api.sounds().then(setItems).catch(e => setErr(e.message))
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)  // odswiez konfig co 5 s (Tkinter moe podmienic)
    return () => clearInterval(id)
  }, [])

  const play = async (s) => {
    if (!s?.present) return
    setLast(s.id)
    try { await api.playSound(s.id) } catch (e) { setErr(e.message) }
  }
  const stopAll = async () => { try { await api.stopSound() } catch (e) { setErr(e.message) } }

  // Klawisze 1..9 -> items[0..8]
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (!/^[1-9]$/.test(e.key)) return
      const s = items[parseInt(e.key, 10) - 1]
      if (!s?.present) return
      e.preventDefault()
      play(s)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items])

  if (err) return <div className="err">Dzwieki: {err}</div>
  return (
    <div className="soundboard">
      <div className="sb-grid">
        {items.slice(0, 9).map((s, i) => (
          <button key={s.id}
                  className={`sb-btn ${last === s.id ? 'active' : ''} ${!s.present ? 'disabled' : ''}`}
                  onClick={() => play(s)}
                  disabled={!s.present}
                  title={s.present ? `Klawisz ${i + 1}` : `Slot ${i + 1} — pusty (dodaj plik w launcherze)`}>
            <span className="sb-num">{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: '.5rem' }}>
        <button className="btn off" onClick={stopAll}>Stop</button>
        <span className="muted">Sloty ustawiasz w launcherze. Skroty: 1..9 na klawiaturze.</span>
      </div>
    </div>
  )
}
