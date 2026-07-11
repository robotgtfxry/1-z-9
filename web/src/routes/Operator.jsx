import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, subscribeState } from '../api'
import SoundBoard from '../components/SoundBoard.jsx'

export default function Operator() {
  const [state, setState] = useState(null)
  const [users, setUsers] = useState([])
  const [brightness, setBrightness] = useState(128)
  const [question, setQuestion] = useState({ text: '', answer: '', round: 1, showAnswer: false })
  const [err, setErr] = useState(null)
  const qSuppress = useRef(0)

  useEffect(() => subscribeState((s) => {
    setState(s); setErr(null)
    setBrightness(s.brightness ?? 128)
    if (Date.now() > qSuppress.current && s.question) {
      setQuestion({
        text:   s.question.text   || '',
        answer: s.question.answer || '',
        round:  s.question.round  || 1,
        showAnswer: !!s.question.showAnswer,
      })
    }
  }), [])

  useEffect(() => { api.users().then(setUsers).catch(e => setErr(e.message)) }, [])

  const run = async (fn) => { try { await fn() } catch (e) { setErr(e.message) } }

  const seats   = state?.seats   || []
  const buttons = state?.buttons || []
  const events  = state?.events  || []
  const round2  = !!state?.round2
  const espOk   = !!state?.espOk

  return (
    <div className="page">
      <header className="topbar">
        <h1>Panel operatora</h1>
        <div className={`status ${espOk ? 'ok' : 'bad'}`}><span className="dot" /> {espOk ? 'ESP32 online' : 'ESP32 offline'}</div>
      </header>

      {err && <div className="err">Blad: {err}</div>}

      <section className="controls">
        <button className={`btn ${round2 ? 'off' : 'go'}`} onClick={() => run(round2 ? api.round2Stop : api.round2Start)}>
          {round2 ? 'Runda 2: STOP' : 'Runda 2: START'}
        </button>
        <button className="btn" onClick={() => run(api.resetLives)}>Reset zyc (3/3)</button>
        <button className="btn" onClick={() => run(api.resetSeats)}>Wyczysc siedzenia</button>
        <label className="slider">
          <span>Jasnosc: {brightness}</span>
          <input type="range" min="0" max="255" value={brightness}
                 onChange={e => { const v = +e.target.value; setBrightness(v); run(() => api.bright(v)) }} />
        </label>
      </section>

      <section className="card">
        <h2 className="h">Stanowiska (9) — kolor + zycia</h2>
        <div className="stands-grid">
          {Array.from({ length: 9 }).map((_, i) => {
            const seat = seats.find(s => s.seat === i)
            const lives = seat?.lives ?? 3
            const color = seat?.color || '#e05252'
            const hasUser = !!seat?.user_id
            const out = hasUser && lives <= 0
            return (
              <article key={i} className={`stand ${out ? 'out' : ''}`}>
                <header>
                  <span className="stand-num">{i + 1}</span>
                  <select value={seat?.user_id || ''} onChange={e => run(() => api.setSeat(i, e.target.value ? +e.target.value : null))}>
                    <option value="">— pusto —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </header>

                <div className="stand-lights">
                  {[0, 1, 2].map(s => {
                    const on = hasUser && s < lives
                    return <div key={s} className="stand-led"
                                style={{ background: on ? color : '#26262e',
                                         boxShadow: on ? `0 0 14px ${color}` : 'none' }} />
                  })}
                </div>

                <div className="stand-controls">
                  <input type="color" value={color}
                         onChange={e => run(() => api.setSeatColor(i, e.target.value))}
                         disabled={!hasUser} title="Kolor stanowiska" />
                  <button className="btn off" disabled={!hasUser || lives <= 0}
                          onClick={() => run(() => api.loseLife(i))}>−1 zycie</button>
                  <button className="mini" disabled={!hasUser || lives >= 3}
                          onClick={() => run(() => api.addLife(i))} title="Cofnij">+1</button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h2 className="h">Przyciski rundy 2 (3)</h2>
          <div className="seats">
            {Array.from({ length: 3 }).map((_, i) => {
              const btn = buttons.find(b => b.button === i)
              return (
                <div key={i} className="seat-row">
                  <span className="seat-num">P{i + 1}</span>
                  <select value={btn?.user_id || ''} onChange={e => run(() => api.setButton(i, e.target.value ? +e.target.value : null))}>
                    <option value="">— pusto —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )
            })}
            <button className="mini" onClick={() => run(api.resetButtons)}>wyczysc przyciski</button>
          </div>
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
      </div>

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
    </div>
  )
}
