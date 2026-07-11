import { useEffect, useState } from 'react'
import { subscribeState } from '../api'

// Zywy stan gry na TV. Techniczny dashboard/HMI-look. Bez glow.
// R1: tabela z kolumnami POS/GRACZ/ZYCIA/STATUS. R2: 3 finalistow.

export default function Wyniki() {
  const [state, setState] = useState(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => subscribeState(setState), [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  if (state?.activeRound === 2) return <RoundTwo state={state} now={now} />
  return <RoundOne state={state} now={now} />
}

// helper: mm:ss z liczby ms
function fmtHms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const [startTime] = [Date.now()]  // dev-only; real gets reset per session

function RoundOne({ state, now }) {
  const seats = state?.seats || []
  const inGame = seats.filter(s => s.user_id && (s.lives ?? 0) > 0).length
  const total  = seats.filter(s => s.user_id).length

  return (
    <div className="wyniki-live w-r1">
      <TopBar nowText={fmtHms(now - startTime)} label="RUNDA 01" tone="r1" />

      <div className="w-panel">
        <div className="w-cols">
          <span>POS</span>
          <span>GRACZ</span>
          <span>ZYCIA</span>
          <span className="right">STATUS</span>
        </div>
        <ol className="w-list">
          {Array.from({ length: 9 }).map((_, i) => {
            const s = seats.find(x => x.seat === i)
            const lives = s?.lives ?? 3
            const color = s?.color || '#e05252'
            const hasUser = !!s?.user_id
            const out = hasUser && lives <= 0
            const status = !hasUser ? 'PUSTE' : out ? 'ODPADA' : 'W GRZE'
            const statusTone = !hasUser ? 'vacant' : out ? 'out' : 'alive'
            return (
              <li key={i}
                  className={`w-row ${out ? 'out' : ''} ${!hasUser ? 'empty' : ''}`}
                  style={{ '--seat-color': color }}>
                <span className="w-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="w-name">{s?.name || '—'}</span>
                <span className="w-lights">
                  {[0, 1, 2].map(sec => (
                    <span key={sec} className={`w-led ${(hasUser && sec < lives) ? 'on' : ''}`} />
                  ))}
                </span>
                <span className={`w-status s-${statusTone}`}>
                  <span className="w-status-dot" /> {status}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <StatusBar
        left={`W GRZE: ${inGame} / ${total || 9}`}
        right={`SESJA ${fmtHms(now - startTime)}`}
      />
    </div>
  )
}

function RoundTwo({ state, now }) {
  const buttons = state?.buttons || []
  const seats   = state?.seats   || []
  const events = state?.events || []
  const current = state?.currentAnswerer

  return (
    <div className="wyniki-live w-r2">
      <TopBar nowText={fmtHms(now - startTime)} label="RUNDA 02 · FINAL" tone="r2" />

      <div className="w-panel">
        <div className="w-cols r2">
          <span>PRZ</span>
          <span>GRACZ</span>
          <span>ZYCIA</span>
          <span>PUNKTY</span>
          <span>REAKCJA</span>
          <span className="right">STATUS</span>
        </div>
        <ol className="w-list w-r2-list">
          {[0, 1, 2].map(i => {
            const b = buttons.find(x => x.button === i)
            const seat = seats.find(s => s.user_id && s.user_id === b?.user_id)
            const points = seat?.points ?? 0
            const lives  = seat?.lives  ?? 3
            const color  = seat?.color  || '#e05252'
            const event = events.find(e => e.id === i)
            const isCurrent = current && current.id === i
            const verdict = event?.verdict
            const status = verdict === 'correct' ? 'POPRAWNA'
                       : verdict === 'wrong'   ? 'BLEDNA'
                       : isCurrent             ? 'ODPOWIADA'
                       : event                 ? 'CZEKA'
                       : !b?.user_id           ? 'PUSTE'
                       : 'GOTOWY'
            const tone = verdict === 'correct' ? 'correct'
                     : verdict === 'wrong'   ? 'wrong'
                     : isCurrent             ? 'current'
                     : !b?.user_id           ? 'vacant'
                     : 'ready'
            return (
              <li key={i}
                  className={`w-row-r2 v-${tone} ${!b?.user_id ? 'empty' : ''}`}
                  style={{ '--seat-color': color }}>
                <span className="w-num r2">P{i + 1}</span>
                <span className="w-name r2">{b?.name || '—'}</span>
                <span className="w-lights r2">
                  {[0, 1, 2].map(sec => (
                    <span key={sec} className={`w-led ${(b?.user_id && sec < lives) ? 'on' : ''}`} />
                  ))}
                </span>
                <span className="w-pts">{points}<em>PKT</em></span>
                <span className="w-ms">{event ? `${event.t}` : '—'} <em>MS</em></span>
                <span className={`w-status r2 s-${tone}`}>
                  <span className="w-status-dot" /> {status}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <StatusBar
        left={current ? `ODPOWIADA: ${current.userName || `P${current.id + 1}`} · ${current.t} MS` : 'CZEKAMY NA KLIKNIECIE'}
        right={`SESJA ${fmtHms(now - startTime)}`}
      />
    </div>
  )
}

function TopBar({ label, tone, nowText }) {
  return (
    <header className={`w-top ${tone}`}>
      <div className="w-top-l">
        <span className="w-top-brand">1Z9</span>
        <span className="w-top-sep">·</span>
        <span className="w-top-title">TABLICA WYNIKOW</span>
      </div>
      <div className="w-top-c">
        <span className={`w-top-badge ${tone}`}>{label}</span>
      </div>
      <div className="w-top-r">
        <span className="w-top-clock">{nowText}</span>
      </div>
    </header>
  )
}

function StatusBar({ left, right }) {
  return (
    <footer className="w-bot">
      <span>{left}</span>
      <span className="w-bot-sep" />
      <span>{right}</span>
    </footer>
  )
}
