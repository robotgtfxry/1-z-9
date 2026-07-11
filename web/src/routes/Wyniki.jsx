import { useEffect, useState } from 'react'
import { api, subscribeState } from '../api'
import Hearts from '../components/Hearts.jsx'

// Widok dla TV sedziego / widowni:
// - GORA: obecna gra (9 siedzen z imieniem i zyciami) - to co sie liczy TERAZ
// - DOL: historyczny leaderboard po wygranych i najlepszym czasie

export default function Wyniki() {
  const [board, setBoard] = useState([])
  const [seats, setSeats] = useState([])
  const [err, setErr] = useState(null)

  const refresh = async () => {
    try { setBoard(await api.leaderboard()); setErr(null) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => {
    refresh()
    return subscribeState(s => { setSeats(s.seats || []); refresh() })
  }, [])

  return (
    <div className="page wyniki">
      <header className="topbar">
        <h1>Tablica wynikow</h1>
      </header>

      {err && <div className="err">Blad: {err}</div>}

      <section className="card">
        <h2 className="h">Obecna gra — zycia</h2>
        <div className="lives-grid">
          {Array.from({ length: 9 }).map((_, i) => {
            const s = seats.find(x => x.seat === i)
            const lives = s?.lives ?? 3
            const out = s?.user_id && lives <= 0
            return (
              <div key={i} className={`life-card ${out ? 'out' : ''}`}>
                <div className="lc-num">{i + 1}</div>
                <div className="lc-name">{s?.name || '—'}</div>
                <Hearts lives={lives} size="lg" />
                {out && <div className="lc-out">ODPADA</div>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card">
        <h2 className="h">Top 100 (statystyki historyczne)</h2>
        {board.length === 0 ? <p className="muted">Brak danych.</p> : (
          <table className="tbl big">
            <thead><tr><th>#</th><th>Gracz</th><th>Wygrane</th><th>Gry</th><th>Best (ms)</th></tr></thead>
            <tbody>
              {board.map((u, i) => (
                <tr key={u.id} className={i < 3 ? `top-${i + 1}` : ''}>
                  <td>{i + 1}</td>
                  <td>{u.name}</td>
                  <td>{u.wins}</td>
                  <td>{u.games_played}</td>
                  <td>{u.best_reaction_ms ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
