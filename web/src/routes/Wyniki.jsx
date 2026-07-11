import { useEffect, useState } from 'react'
import { api, subscribeState } from '../api'

// Widok tablicy wynikow – sama lista, bez kafelek biezacej gry.
export default function Wyniki() {
  const [board, setBoard] = useState([])
  const [err, setErr] = useState(null)

  const refresh = async () => {
    try { setBoard(await api.leaderboard()); setErr(null) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => {
    refresh()
    return subscribeState(refresh)
  }, [])

  return (
    <div className="page wyniki">
      <header className="topbar"><h1>Tablica wynikow</h1></header>
      {err && <div className="err">Blad: {err}</div>}

      <section className="card">
        <h2 className="h">Top 100 (po wygranych, potem po najlepszym czasie)</h2>
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
