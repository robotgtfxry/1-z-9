import { useEffect, useRef, useState } from 'react'
import { api } from './api'

const NUM_PANELS = 9
const SECTORS = 3

const hexToRgb = (h) => ({
  r: parseInt(h.slice(1, 3), 16),
  g: parseInt(h.slice(3, 5), 16),
  b: parseInt(h.slice(5, 7), 16),
})
const toHex = (n) => n.toString(16).padStart(2, '0')
const rgbToHex = ({ r, g, b }) => `#${toHex(r)}${toHex(g)}${toHex(b)}`

const emptyPanels = () =>
  Array.from({ length: NUM_PANELS }, () =>
    Array.from({ length: SECTORS }, () => ({ r: 255, g: 34, b: 0, on: false }))
  )

export default function App() {
  const [panels, setPanels] = useState(emptyPanels)
  const [brightness, setBrightness] = useState(128)
  const [round2, setRound2] = useState(false)
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const suppressPoll = useRef(0) // ignoruj polling przez chwile po lokalnej edycji

  // Polling stanu
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const s = await api.state()
        if (!alive) return
        setConnected(true)
        setError(null)
        setBrightness(s.brightness ?? 128)
        setRound2(!!s.round2)
        setEvents(s.events || [])
        if (Date.now() > suppressPoll.current && Array.isArray(s.panels)) {
          setPanels(s.panels)
        }
      } catch (e) {
        if (!alive) return
        setConnected(false)
        setError(e.message)
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const withOptimisticUpdate = () => { suppressPoll.current = Date.now() + 1500 }

  const setSector = async (p, s, patch) => {
    withOptimisticUpdate()
    setPanels(prev => {
      const next = prev.map(row => row.map(x => ({ ...x })))
      next[p][s] = { ...next[p][s], ...patch }
      return next
    })
    const cur = { ...panels[p][s], ...patch }
    try { await api.sector(p, s, cur.on, cur.r, cur.g, cur.b) }
    catch (e) { setError(e.message) }
  }

  const toggleSector = (p, s) => setSector(p, s, { on: !panels[p][s].on })
  const changeColor  = (p, s, hex) => setSector(p, s, { ...hexToRgb(hex), on: panels[p][s].on })

  const togglePanel = async (p) => {
    withOptimisticUpdate()
    const anyOff = panels[p].some(x => !x.on)
    const { r, g, b } = panels[p][0]
    setPanels(prev => {
      const next = prev.map(row => row.map(x => ({ ...x })))
      next[p] = next[p].map(x => ({ ...x, on: anyOff }))
      return next
    })
    try { await api.panel(p, anyOff, r, g, b) }
    catch (e) { setError(e.message) }
  }

  const offAll = async () => {
    withOptimisticUpdate()
    setPanels(prev => prev.map(row => row.map(x => ({ ...x, on: false }))))
    try { await api.offAll() } catch (e) { setError(e.message) }
  }

  const changeBright = async (v) => {
    setBrightness(v)
    try { await api.bright(v) } catch (e) { setError(e.message) }
  }

  const startR2 = async () => { try { await api.round2Start() } catch (e) { setError(e.message) } }
  const stopR2  = async () => { try { await api.round2Stop()  } catch (e) { setError(e.message) } }

  const sorted = [...events].sort((a, b) => a.t - b.t)

  return (
    <div className="app">
      <header className="topbar">
        <h1>1 z 9 <span className="sub">panel operatora</span></h1>
        <div className={`status ${connected ? 'ok' : 'bad'}`}>
          <span className="dot" /> {connected ? 'polaczono z ESP32' : 'brak polaczenia'}
        </div>
      </header>

      {error && <div className="err">Blad: {error}</div>}

      <section className="controls">
        <button className="btn go"   onClick={offAll}>Zgas wszystko</button>
        <button className={`btn ${round2 ? 'off' : 'go'}`} onClick={round2 ? stopR2 : startR2}>
          {round2 ? 'Runda 2: STOP' : 'Runda 2: START'}
        </button>
        <label className="slider">
          <span>Jasnosc: {brightness}</span>
          <input type="range" min="0" max="255" value={brightness}
                 onChange={e => changeBright(+e.target.value)} />
        </label>
      </section>

      <section className="grid">
        {panels.map((sectors, p) => (
          <article key={p} className="panel">
            <header>
              <h2>Panel {p + 1}</h2>
              <button className="mini" onClick={() => togglePanel(p)}>wszystkie</button>
            </header>
            {sectors.map((sec, s) => (
              <div key={s} className={`sector ${sec.on ? 'on' : ''}`}>
                <span className="lbl">Sek {s + 1}</span>
                <input type="color" value={rgbToHex(sec)}
                       onChange={e => changeColor(p, s, e.target.value)} />
                <button className={`toggle ${sec.on ? 'on' : ''}`}
                        onClick={() => toggleSector(p, s)}>
                  {sec.on ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </article>
        ))}
      </section>

      <section className="ranking">
        <header>
          <h2>Runda 2 — ranking</h2>
          <span className={`live ${round2 ? 'on' : ''}`}>{round2 ? 'LIVE' : 'nieaktywna'}</span>
        </header>
        {sorted.length === 0 ? (
          <p className="muted">Brak klikniec.</p>
        ) : (
          <ol>
            {sorted.map((e, i) => (
              <li key={e.id}>
                <span className="pos">{i + 1}</span>
                Gracz <b>{e.id + 1}</b>
                <span className="ms">{e.t} ms</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
