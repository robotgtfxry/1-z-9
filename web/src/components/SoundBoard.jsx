import { useEffect, useState } from 'react'
import { api } from '../api'

// Panel operatora: siatka przyciskow z dzwiekami.
// Kliknij -> POST /api/sound/play -> backend broadcast SSE -> wszystkie karty graja.

export default function SoundBoard() {
  const [items, setItems] = useState([])
  const [err, setErr] = useState(null)
  const [last, setLast] = useState(null)

  useEffect(() => { api.sounds().then(setItems).catch(e => setErr(e.message)) }, [])

  const play = async (s) => {
    setLast(s.id)
    try { await api.playSound(s.id) } catch (e) { setErr(e.message) }
  }
  const stopAll = async () => { try { await api.stopSound() } catch (e) { setErr(e.message) } }

  if (err) return <div className="err">Dzwieki: {err}</div>
  return (
    <div className="soundboard">
      <div className="sb-grid">
        {items.map(s => (
          <button key={s.id}
                  className={`sb-btn ${last === s.id ? 'active' : ''}`}
                  style={{ '--sb': s.color }}
                  onClick={() => play(s)}
                  title={s.file}>
            <span className="sb-dot" />
            <span className="sb-label">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: '.5rem' }}>
        <button className="btn off" onClick={stopAll}>Stop</button>
        <span className="muted">Klikniecie odtwarza dzwiek jednoczesnie na wszystkich otwartych kartach.</span>
      </div>
    </div>
  )
}
