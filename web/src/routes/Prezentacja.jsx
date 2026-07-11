import { useEffect, useState } from 'react'
import { subscribeState } from '../api'
import PanelGrid from '../components/PanelGrid.jsx'

// Widok "co widzi widownia".
// - Pytanie z badgem RUNDY (jesli ustawione)
// - Duza siatka 9 paneli z imionami
// - Podczas rundy 2: hero-banner "kto pierwszy" z reakcja w ms

export default function Prezentacja() {
  const [state, setState] = useState(null)

  useEffect(() => subscribeState(setState), [])

  const round2 = !!state?.round2
  const events = state?.events || []
  const buttons = state?.buttons || []
  const seats = state?.seats || []
  const q = state?.question
  const first = events[0]

  // Podswietl siedzenia finalistow (mapa button->seat po userze)
  const finalistSeats = buttons
    .filter(b => b.user_id)
    .map(b => seats.find(s => s.user_id === b.user_id)?.seat)
    .filter(x => x != null)

  return (
    <div className="page prezentacja">
      <h1 className="huge">1 z 9</h1>

      {q?.text && (
        <section className={`q-hero r${q.round}`}>
          <div className="q-badge">RUNDA {q.round}</div>
          <div className="q-text">{q.text}</div>
          {q.answer && q.showAnswer && (
            <div className="q-reveal">Odpowiedz: <b>{q.answer}</b></div>
          )}
        </section>
      )}

      <PanelGrid panels={state?.panels || []} seats={seats} size="lg" highlight={finalistSeats} />

      {round2 && (
        <section className="hero">
          <div className={`hero-title ${first ? 'reveal' : ''}`}>
            {first ? (
              <>
                <span className="rank1">1.</span>
                <b>{first.userName || `Przycisk ${first.id + 1}`}</b>
                <span className="ms">{first.t} ms</span>
              </>
            ) : (
              <span className="wait">Runda 2 — czekamy na klikniecie...</span>
            )}
          </div>

          {events.length > 1 && (
            <ol className="hero-rank">
              {events.slice(1).map((e, i) => (
                <li key={`${e.id}-${e.t}`}>
                  <span className={`pos p${i + 2}`}>{i + 2}</span>
                  <b>{e.userName || `Przycisk ${e.id + 1}`}</b>
                  <span className="ms">{e.t} ms</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  )
}
