import { useEffect, useState } from 'react'
import { subscribeState } from '../api'

// Widok prezentacji dla widowni — tylko pytanie na pelnym ekranie.
// Kiedy nie ma pytania: pusty granatowy ekran z drobnym "1 z 9".

export default function Prezentacja() {
  const [state, setState] = useState(null)
  useEffect(() => subscribeState(setState), [])
  const q = state?.question

  return (
    <div className={`prez-only ${q?.text ? `r${q.round}` : 'idle'}`}>
      {q?.text ? (
        <div className="prez-box">
          <div className="prez-badge">RUNDA {q.round}</div>
          <div className="prez-question">{q.text}</div>
          {q.answer && q.showAnswer && (
            <div className="prez-answer">Odpowiedz: <b>{q.answer}</b></div>
          )}
        </div>
      ) : (
        <div className="prez-idle">1 z 9</div>
      )}
    </div>
  )
}
