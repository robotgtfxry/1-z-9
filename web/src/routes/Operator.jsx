import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, subscribeState } from '../api'
import PanelGrid from '../components/PanelGrid.jsx'
import SoundBoard from '../components/SoundBoard.jsx'
import Hearts from '../components/Hearts.jsx'

const hexToRgb = (h) => ({
  r: parseInt(h.slice(1, 3), 16),
  g: parseInt(h.slice(3, 5), 16),
  b: parseInt(h.slice(5, 7), 16),
})
const toHex = (n) => n.toString(16).padStart(2, '0')
const rgbToHex = ({ r, g, b }) => `#${toHex(r)}${toHex(g)}${toHex(b)}`

const emptyPanels = () =>
  Array.from({ length: 9 }, () => Array.from({ length: 3 }, () => ({ r: 255, g: 34, b: 0, on: false })))

export default function Operator() {
  const [panels, setPanels] = useState(emptyPanels)
  const [brightness, setBrightness] = useState(128)
  const [round2, setRound2] = useState(false)
  const [events, setEvents] = useState([])
  const [seats, setSeats] = useState([])
  const [buttons, setButtons] = useState([])
  const [users, setUsers] = useState([])
  const [espOk, setEspOk] = useState(false)
  const [err, setErr] = useState(null)
  const [question, setQuestion] = useState({ text: '', answer: '', round: 1, showAnswer: false })
  const suppress = useRef(0)
  const qSuppress = useRef(0)

  useEffect(() => {
    return subscribeState((s) => {
      setEspOk(!!s.espOk); setErr(null)
      setRound2(!!s.round2); setEvents(s.events || [])
      setSeats(s.seats || []); setButtons(s.buttons || [])
      setBrightness(s.brightness ?? 128)
      if (Date.now() > suppress.current && Array.isArray(s.panels) && s.panels.length === 9)
        setPanels(s.panels)
      if (Date.now() > qSuppress.current && s.question) {
        setQuestion({
          text:   s.question.text   || '',
          answer: s.question.answer || '',
          round:  s.question.round  || 1,
          showAnswer: !!s.question.showAnswer,
        })
      }
    })
  }, [])

  useEffect(() => { refreshUsers() }, [])
  const refreshUsers = async () => { try { setUsers(await api.users()) } catch (e) { setErr(e.message) } }

  const optimistic = () => { suppress.current = Date.now() + 1500 }
  const run = async (fn) => { try { await fn() } catch (e) { setErr(e.message) } }

  const setSector = async (p, s, patch) => {
    optimistic()
    setPanels(prev => { const n = prev.map(r => r.map(x => ({ ...x }))); n[p][s] = { ...n[p][s], ...patch }; return n })
    const cur = { ...panels[p][s], ...patch }
    run(() => api.sector(p, s, cur.on, cur.r, cur.g, cur.b))
  }

  const togglePanel = async (p) => {
    optimistic()
    const anyOff = panels[p].some(x => !x.on)
    const { r, g, b } = panels[p][0]
    setPanels(prev => { const n = prev.map(r => r.map(x => ({ ...x }))); n[p] = n[p].map(x => ({ ...x, on: anyOff })); return n })
    run(() => api.panel(p, anyOff, r, g, b))
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Panel operatora</h1>
        <div className={`status ${espOk ? 'ok' : 'bad'}`}><span className="dot" /> {espOk ? 'ESP32 online' : 'ESP32 offline'}</div>
      </header>

      {err && <div className="err">Blad: {err}</div>}

      <section className="controls">
        <button className="btn go" onClick={() => run(api.offAll)}>Zgas wszystko</button>
        <button className={`btn ${round2 ? 'off' : 'go'}`} onClick={() => run(round2 ? api.round2Stop : api.round2Start)}>
          {round2 ? 'Runda 2: STOP' : 'Runda 2: START'}
        </button>
        <label className="slider">
          <span>Jasnosc: {brightness}</span>
          <input type="range" min="0" max="255" value={brightness}
                 onChange={e => { const v = +e.target.value; setBrightness(v); run(() => api.bright(v)) }} />
        </label>
      </section>

      <section className="card">
        <h2 className="h">Tablica dzwiekow</h2>
        <SoundBoard />
      </section>

      <section className="card">
        <div className="q-op-header">
          <h2 className="h">Pytanie na prezentacji</h2>
          <Link to="/pytania" className="mini">bank pytan →</Link>
        </div>
        <div className="q-op-form">
          <div className="q-op-round">
            <label className={`chip ${question.round === 1 ? 'on' : ''}`}>
              <input type="radio" name="qround" checked={question.round === 1}
                     onChange={() => { qSuppress.current = Date.now() + 1500; setQuestion(q => ({ ...q, round: 1 })) }} /> RUNDA 1
            </label>
            <label className={`chip ${question.round === 2 ? 'on' : ''}`}>
              <input type="radio" name="qround" checked={question.round === 2}
                     onChange={() => { qSuppress.current = Date.now() + 1500; setQuestion(q => ({ ...q, round: 2 })) }} /> RUNDA 2
            </label>
          </div>
          <textarea rows={2} placeholder="Tresc pytania (widoczna na prezentacji)"
                    value={question.text}
                    onChange={e => { qSuppress.current = Date.now() + 1500; setQuestion(q => ({ ...q, text: e.target.value })) }} />
          <input placeholder="Odpowiedz (opcjonalna — ukryta do 'odslon')"
                 value={question.answer}
                 onChange={e => { qSuppress.current = Date.now() + 1500; setQuestion(q => ({ ...q, answer: e.target.value })) }} />
          <div className="row">
            <button className="btn go" onClick={() => run(() => api.setQuestion(question.text, question.answer, question.round, question.showAnswer))}>
              Pokaz na prezentacji
            </button>
            <button className="btn" onClick={() => {
              const show = !question.showAnswer
              setQuestion(q => ({ ...q, showAnswer: show }))
              qSuppress.current = Date.now() + 1500
              run(() => api.reveal(show))
            }} disabled={!question.answer}>
              {question.showAnswer ? 'Ukryj odpowiedz' : 'Odslon odpowiedz'}
            </button>
            <button className="btn off" onClick={() => { setQuestion({ text: '', answer: '', round: question.round, showAnswer: false }); run(api.clearQuestion) }}>
              Zdejmij
            </button>
          </div>
        </div>
      </section>

      <div className="two-col">
        <section>
          <h2 className="h">Panele LED (9 × 3 sektory)</h2>
          <div className="grid">
            {panels.map((secs, p) => {
              const seat = seats.find(s => s.seat === p)
              return (
                <article key={p} className="panel">
                  <header>
                    <h3>Panel {p + 1} <span className="muted">{seat?.name || '—'}</span></h3>
                    <button className="mini" onClick={() => togglePanel(p)}>wszystkie</button>
                  </header>
                  {secs.map((sec, s) => (
                    <div key={s} className={`sector ${sec.on ? 'on' : ''}`}>
                      <span className="lbl">Sek {s + 1}</span>
                      <input type="color" value={rgbToHex(sec)} onChange={e => setSector(p, s, { ...hexToRgb(e.target.value), on: sec.on })} />
                      <button className={`toggle ${sec.on ? 'on' : ''}`} onClick={() => setSector(p, s, { on: !sec.on })}>{sec.on ? 'ON' : 'OFF'}</button>
                    </div>
                  ))}
                </article>
              )
            })}
          </div>
        </section>

        <aside className="side">
          <section className="card">
            <h2 className="h">Podglad prezentacji</h2>
            <PanelGrid panels={panels} seats={seats} size="sm"
                       highlight={buttons.filter(b => b.user_id).map(b => seats.find(s => s.user_id === b.user_id)?.seat).filter(x => x != null)} />
          </section>

          <section className="card">
            <h2 className="h">Runda 2 — ranking</h2>
            {events.length === 0 ? <p className="muted">Brak klikniec.</p> : (
              <ol className="rank">
                {events.map((e, i) => (
                  <li key={`${e.id}-${e.t}`}>
                    <span className={`pos p${i + 1}`}>{i + 1}</span>
                    <b>{e.userName || `Przycisk ${e.id + 1}`}</b>
                    <span className="ms">{e.t} ms</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card">
            <h2 className="h">Siedzenia (9) — zycia</h2>
            <div className="seats">
              {Array.from({ length: 9 }).map((_, i) => {
                const seat = seats.find(s => s.seat === i)
                const lives = seat?.lives ?? 3
                const hasUser = !!seat?.user_id
                return (
                  <div key={i} className="seat-row lives">
                    <span className="seat-num">{i + 1}</span>
                    <select value={seat?.user_id || ''} onChange={e => run(async () => { await api.setSeat(i, e.target.value ? +e.target.value : null) })}>
                      <option value="">— pusto —</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <Hearts lives={lives} size="sm" />
                    <div className="life-btns">
                      <button className="mini" disabled={!hasUser || lives <= 0} onClick={() => run(() => api.loseLife(i))} title="Zla odpowiedz (-1)">−</button>
                      <button className="mini" disabled={!hasUser || lives >= 3} onClick={() => run(() => api.addLife(i))} title="Cofnij (+1)">+</button>
                    </div>
                  </div>
                )
              })}
              <div className="row" style={{ marginTop: '.5rem' }}>
                <button className="mini" onClick={() => run(api.resetLives)}>reset zyc (3/3)</button>
                <button className="mini" onClick={() => run(api.resetSeats)}>wyczysc siedzenia</button>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="h">Przyciski rundy 2 (3)</h2>
            <div className="seats">
              {Array.from({ length: 3 }).map((_, i) => {
                const btn = buttons.find(b => b.button === i)
                return (
                  <div key={i} className="seat-row">
                    <span className="seat-num">P{i + 1}</span>
                    <select value={btn?.user_id || ''} onChange={e => run(async () => { await api.setButton(i, e.target.value ? +e.target.value : null) })}>
                      <option value="">— pusto —</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                )
              })}
              <button className="mini" onClick={() => run(api.resetButtons)}>wyczysc przyciski</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
