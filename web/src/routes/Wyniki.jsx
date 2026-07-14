import { useEffect, useState } from 'react'
import { subscribeState } from '../api'

export default function Wyniki() {
  const [state, setState] = useState(null)
  useEffect(() => subscribeState(setState), [])
  return state?.activeRound === 2 ? <RoundTwo state={state} /> : <RoundOne state={state} />
}

function RoundOne({ state }) {
  const seats = state?.seats || []
  const alive = seats.filter(s => s.user_id && (s.lives ?? 0) > 0).length
  const assigned = seats.filter(s => s.user_id).length

  // 9 stanowisk, sortowane: aktywni po punktach malejaco, odpadli nizej, puste na koncu.
  const rows = Array.from({ length: 9 }, (_, i) => {
    const s = seats.find(x => x.seat === i)
    return { idx: i, seat: s }
  }).sort((a, b) => {
    const aE = !a.seat?.user_id, bE = !b.seat?.user_id
    if (aE !== bE) return aE ? 1 : -1
    const aO = !aE && (a.seat?.lives ?? 0) <= 0
    const bO = !bE && (b.seat?.lives ?? 0) <= 0
    if (aO !== bO) return aO ? 1 : -1
    return (b.seat?.points ?? 0) - (a.seat?.points ?? 0) || a.idx - b.idx
  })

  return (
    <div className="wyn">
      <header className="wyn-top">
        <div className="wyn-brand">1 z 9</div>
        <div className="wyn-round">runda 1</div>
        <div className="wyn-count">{alive} <span>z {assigned || 9}</span></div>
      </header>

      <ol className="wyn-list">
        {rows.map(({ idx, seat: s }) => {
          const lives = s?.lives ?? 3
          const points = s?.points ?? 0
          const color = s?.color || '#f5f5f5'
          const hasUser = !!s?.user_id
          const out = hasUser && lives <= 0
          return (
            <li key={idx}
                className={out ? 'out' : (!hasUser ? 'empty' : '')}
                style={{ '--seat-color': color }}>
              <span className="wyn-idx">{String(idx + 1).padStart(2, '0')}</span>
              <span className="wyn-name">{s?.name || 'brak'}</span>
              <span className="wyn-pts">{hasUser ? points : ''}</span>
              <span className="wyn-dots">
                {[0, 1, 2].map(sec => (
                  <span key={sec} className={(hasUser && sec < lives) ? 'on' : ''} />
                ))}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function RoundTwo({ state }) {
  const buttons = state?.buttons || []
  const seats = state?.seats || []
  const events = state?.events || []
  const current = state?.currentAnswerer

  // 3 finalisci, sortowani po punktach malejaco
  const finalists = [0, 1, 2].map(i => {
    const b = buttons.find(x => x.button === i)
    const seat = seats.find(s => s.user_id && s.user_id === b?.user_id)
    const event = events.find(e => e.id === i)
    const isCurrent = current && current.id === i
    const verdict = event?.verdict
    return { button: i, b, seat, event, isCurrent, verdict, points: seat?.points ?? 0 }
  }).sort((a, b) => {
    const aE = !a.b?.user_id, bE = !b.b?.user_id
    if (aE !== bE) return aE ? 1 : -1
    return b.points - a.points || a.button - b.button
  })

  return (
    <div className="wyn wyn-r2">
      <header className="wyn-top">
        <div className="wyn-brand">1 z 9</div>
        <div className="wyn-round">runda 2 · finał</div>
        {current
          ? <div className="wyn-count">{current.t}<span>ms</span></div>
          : <div className="wyn-count wyn-count-idle">czekamy</div>}
      </header>

      <ol className="wyn-list">
        {finalists.map(f => {
          const hasUser = !!f.b?.user_id
          const lives  = f.seat?.lives  ?? 3
          const points = f.points
          const color  = f.seat?.color  || '#f5f5f5'
          const cls = f.verdict === 'correct' ? 'v-ok'
                    : f.verdict === 'wrong'   ? 'v-bad'
                    : f.isCurrent             ? 'v-cur'
                    : !hasUser                ? 'empty'
                    : ''
          return (
            <li key={f.button} className={cls} style={{ '--seat-color': color }}>
              <span className="wyn-idx">P{f.button + 1}</span>
              <span className="wyn-name">{f.b?.name || 'brak'}</span>
              <span className="wyn-pts">{hasUser ? points : ''}</span>
              <span className="wyn-dots">
                {[0, 1, 2].map(sec => (
                  <span key={sec} className={(hasUser && sec < lives) ? 'on' : ''} />
                ))}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
