import { useEffect, useState } from 'react'
import { api, subscribeState } from '../api'
import SoundBoard from '../components/SoundBoard.jsx'
import HoldButton from '../components/HoldButton.jsx'

export default function Operator() {
  const [state, setState] = useState(null)
  const [users, setUsers] = useState([])
  const [brightness, setBrightness] = useState(128)
  const [err, setErr] = useState(null)

  useEffect(() => subscribeState((s) => {
    setState(s); setErr(null)
    setBrightness(s.brightness ?? 128)
  }), [])

  useEffect(() => { api.users().then(setUsers).catch(e => setErr(e.message)) }, [])

  const [questions, setQuestions] = useState([])
  useEffect(() => { api.questions().then(setQuestions).catch(() => {}) },
             [state?.question?.questionId, state?.question?.updatedAt])

  const run = async (fn) => { try { await fn() } catch (e) { setErr(e.message) } }

  // Aktualna runda idzie z backendu (activeRound). Zmiana - > zerowanie pytania -> home screen.
  const activeRound = state?.activeRound ?? 1
  const switchRound = (r) => {
    if (r === activeRound) return
    run(() => api.setRound(r))
  }

  const seats   = state?.seats   || []
  const buttons = state?.buttons || []
  const events  = state?.events  || []
  const round2  = !!state?.round2
  const espOk   = !!state?.espOk
  const curQ    = state?.question
  const hasAnswer = !!(curQ?.answer && curQ.answer.trim())
  const filteredQuestions = questions.filter(q => q.round === activeRound)
  const qIdx = curQ?.questionId ? filteredQuestions.findIndex(q => q.id === curQ.questionId) : -1
  const qPosLabel = curQ?.text
    ? (qIdx >= 0 ? `Pytanie ${qIdx + 1}/${filteredQuestions.length}` : 'Recznie wpisane')
    : null

  return (
    <div className="page">
      <header className="topbar">
        <h1>Panel operatora</h1>
        <div className={`status ${espOk ? 'ok' : 'bad'}`}><span className="dot" /> {espOk ? 'ESP32 online' : 'ESP32 offline'}</div>
      </header>

      {err && <div className="err">Blad: {err}</div>}

      <section className="controls">
        <div className="qnav">
          <div className="qnav-filter" title="Zakres nawigacji Poprzednie/Nastepne">
            <button className={`chip ${activeRound === 1 ? 'on' : ''}`} onClick={() => switchRound(1)}>R1</button>
            <button className={`chip ${activeRound === 2 ? 'on' : ''}`} onClick={() => switchRound(2)}>R2</button>
          </div>
          <button className="btn" onClick={() => run(api.prevQuestion)} title="Poprzednie pytanie">◀</button>
          <div className="qnav-pos">
            {qPosLabel ? (
              <>
                <span className={`badge r${curQ.round}`}>R{curQ.round}</span>
                <span className="qnav-num">{qPosLabel}</span>
              </>
            ) : <span className="muted">brak pytania</span>}
          </div>
          <button className="btn" onClick={() => run(api.nextQuestion)} title="Nastepne pytanie">▶</button>
          <button className="btn" onClick={() => run(() => api.reveal(!curQ?.showAnswer))}
                  disabled={!curQ?.text || !hasAnswer} title="Odslon/ukryj odpowiedz">
            {curQ?.showAnswer ? 'Ukryj odp.' : 'Odslon odp.'}
          </button>
        </div>
        <button className="btn" onClick={() => run(api.resetLives)}>Reset zyc</button>
        <button className="btn" onClick={() => run(api.resetPoints)}>Reset pkt</button>
        <label className="slider">
          <span>Jasnosc: {brightness}</span>
          <input type="range" min="0" max="255" value={brightness}
                 onChange={e => { const v = +e.target.value; setBrightness(v); run(() => api.bright(v)) }} />
        </label>
      </section>

      <section className="card">
        <h2 className="h">{activeRound === 2 ? 'Finalisci (3)' : 'Stanowiska (9)'} — zycia + punkty</h2>
        <div className="stands-grid">
          {Array.from({ length: 9 }).map((_, i) => {
            const seat = seats.find(s => s.seat === i)
            const lives  = seat?.lives  ?? 3
            const points = seat?.points ?? 0
            const color  = seat?.color || '#e05252'
            const hasUser = !!seat?.user_id
            const isFinalist = hasUser && buttons.some(b => b.user_id === seat.user_id)
            const isR2 = activeRound === 2
            // W R2 pokazujemy tylko finalistow
            if (isR2 && !isFinalist) return null
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
                  {[0, 1, 2].map(s => (
                    <div key={s} className="stand-led"
                         style={{ background: (hasUser && s < lives) ? color : '#26262e' }} />
                  ))}
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

                <div className="stand-points">
                  <span className="pts-count">{points} pkt</span>
                  <button className="btn go" disabled={!hasUser}
                          onClick={() => run(() => api.addPoint(i))}>+1 punkt</button>
                  <button className="mini" disabled={!hasUser || points <= 0}
                          onClick={() => run(() => api.losePoint(i))} title="Cofnij">−1</button>
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
          <div className="q-op-header">
            <h2 className="h">Runda 2 — ranking</h2>
            <button className="mini" onClick={() => run(api.resetVerdicts)}>reset werdyktow</button>
          </div>
          {events.length === 0 ? <p className="muted">Brak klikniec.</p> : (
            <ol className="rank">
              {events.map((e, i) => {
                const isCurrent = state?.currentAnswerer && state.currentAnswerer.id === e.id && state.currentAnswerer.t === e.t
                return (
                  <li key={`${e.id}-${e.t}`} className={`v-${e.verdict || 'none'} ${isCurrent ? 'current' : ''}`}>
                    <span className={`pos p${i + 1}`}>{i + 1}</span>
                    <b>{e.userName || `Przycisk ${e.id + 1}`}</b>
                    <span className="ms">{e.t} ms</span>
                    {e.verdict === 'correct' && <span className="v-badge ok">✓</span>}
                    {e.verdict === 'wrong'   && <span className="v-badge bad">✗</span>}
                    {isCurrent && (
                      <div className="v-actions">
                        <button className="btn go"  onClick={() => run(api.markCorrect)}>✓ Poprawna</button>
                        <button className="btn off" onClick={() => run(api.markWrong)}>✗ Bledna</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="h">Tablica dzwiekow</h2>
        <SoundBoard />
      </section>

      <div className="danger-zone">
        <HoldButton className="danger-btn" onConfirm={() => run(api.resetGame)} duration={2000}
                    hint="Przytrzymaj 2 sekundy">
          RESTART CAŁKOWITY
        </HoldButton>
      </div>
    </div>
  )
}
