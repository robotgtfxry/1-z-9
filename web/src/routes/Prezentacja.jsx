import { useEffect, useState } from 'react'
import { subscribeState } from '../api'

// Prezentacja dla widowni:
// - Pytanie rundy 2 na ekranie -> pytanie u gory + 3 karty finalistow ponizej,
//   z podswietleniem osoby ktora klikneła pierwsza
// - Pytanie rundy 1 -> samo pytanie
// - Brak pytania + runda 2 aktywna + buzz -> hero z pierwszym nickiem
// - Brak pytania + runda 2 aktywna -> "czekamy..."
// - Nic -> "1 z 9"

export default function Prezentacja() {
  const [state, setState] = useState(null)
  useEffect(() => subscribeState(setState), [])

  const q = state?.question
  const round2 = !!state?.round2
  const events = state?.events || []
  const buttons = state?.buttons || []
  const first = events[0]

  // Runda 2 z pytaniem na ekranie
  if (q?.text && q.round === 2) {
    return (
      <div className="prez-only r2 with-finalists">
        <div className="prez-r2-top">
          <div className="prez-badge">RUNDA 2</div>
          <div className="prez-question">{q.text}</div>
          {q.answer && q.showAnswer && (
            <div className="prez-answer">Odpowiedz: <b>{q.answer}</b></div>
          )}
        </div>
        <div className="prez-finalists">
          {[0, 1, 2].map(i => {
            const b = buttons.find(x => x.button === i)
            const event = events.find(e => e.id === i)
            const pos = event?.position
            return (
              <div key={i} className={`fin-card ${pos === 1 ? 'first' : ''} ${event ? 'buzzed' : ''} ${!b?.user_id ? 'empty' : ''}`}>
                <div className="fin-num">P{i + 1}</div>
                <div className="fin-name">{b?.name || '—'}</div>
                {event && (
                  <div className="fin-buzz">
                    <div className="fin-pos">{pos === 1 ? '1. MIEJSCE' : `${pos}. miejsce`}</div>
                    <div className="fin-ms">{event.t} ms</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Runda 2 aktywna bez pytania — hero pierwszego lub czekamy
  if (round2 && first) {
    return (
      <div className="prez-only buzz">
        <div className="prez-buzz">
          <div className="prez-buzz-badge">1. MIEJSCE</div>
          <div className="prez-buzz-name" key={`${first.id}-${first.t}`}>
            {first.userName || `Przycisk ${first.id + 1}`}
          </div>
          <div className="prez-buzz-ms">{first.t} ms</div>
          {events.length > 1 && (
            <ol className="prez-buzz-others">
              {events.slice(1).map((e, i) => (
                <li key={`${e.id}-${e.t}`}>
                  <span className="pos">{i + 2}</span>
                  <b>{e.userName || `Przycisk ${e.id + 1}`}</b>
                  <span className="ms">{e.t} ms</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    )
  }
  if (round2) {
    return (
      <div className="prez-only waiting">
        <div className="prez-waiting">Runda 2 — czekamy na klikniecie...</div>
      </div>
    )
  }

  // Poza runda 2: pytanie R1 albo idle
  if (q?.text) {
    return (
      <div className={`prez-only r${q.round}`}>
        <div className="prez-box">
          <div className="prez-badge">RUNDA {q.round}</div>
          <div className="prez-question">{q.text}</div>
          {q.answer && q.showAnswer && (
            <div className="prez-answer">Odpowiedz: <b>{q.answer}</b></div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="prez-only idle">
      <div className="prez-idle">1 z 9</div>
    </div>
  )
}
