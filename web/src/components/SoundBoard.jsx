import { useEffect, useState } from 'react'
import { api } from '../api'

// Panel operatora: 9 przyciskow oznaczonych 1..9.
// Skrot: klawisze 1..9 na klawiaturze odtwarzaja dzwiek pod danym numerem
// (ignorowane gdy focus jest w polu tekstowym).

export default function SoundBoard() {
  const [items, setItems] = useState([])
  const [err, setErr] = useState(null)
  const [last, setLast] = useState(null)

  useEffect(() => { api.sounds().then(setItems).catch(e => setErr(e.message)) }, [])

  const play = async (s) => {
    if (!s) return
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
      if (!s) return
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
                  className={`sb-btn ${last === s.id ? 'active' : ''}`}
                  style={{ '--sb': s.color }}
                  onClick={() => play(s)}
                  title={`Klawisz ${i + 1} — ${s.label}`}>
            <span className="sb-num">{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: '.5rem' }}>
        <button className="btn off" onClick={stopAll}>Stop</button>
        <span className="muted">Skroty: 1..9 na klawiaturze. Klikniecie odtwarza dzwiek na wszystkich kartach.</span>
      </div>
    </div>
  )
}
