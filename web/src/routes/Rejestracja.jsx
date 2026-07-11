import { useEffect, useState } from 'react'
import { api } from '../api'

export default function Rejestracja() {
  const [users, setUsers] = useState([])
  const [name, setName] = useState('')
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const refresh = async () => { try { setUsers(await api.users()) } catch (e) { setErr(e.message) } }
  useEffect(() => { refresh() }, [])

  const add = async (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    try {
      const u = await api.addUser(n)
      setMsg(`Zarejestrowano: ${u.name}`)
      setErr(null); setName('')
      refresh()
    } catch (e) {
      setErr(e.message.includes('409') ? 'Taki gracz juz istnieje' : e.message)
      setMsg(null)
    }
  }

  const del = async (id, n) => {
    if (!confirm(`Usunac gracza "${n}"?`)) return
    try { await api.deleteUser(id); refresh() } catch (e) { setErr(e.message) }
  }

  return (
    <div className="page">
      <h1>Rejestracja graczy</h1>

      <form className="card row" onSubmit={add}>
        <input autoFocus placeholder="Imie / nick" value={name} maxLength={32}
               onChange={e => setName(e.target.value)} />
        <button className="btn go">Dodaj</button>
      </form>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="err">{err}</div>}

      <section className="card">
        <h2 className="h">Zapisani gracze ({users.length})</h2>
        {users.length === 0 ? <p className="muted">Brak graczy.</p> : (
          <table className="tbl">
            <thead><tr><th>#</th><th>Imie</th><th>Gry</th><th>Wygrane</th><th>Best (ms)</th><th /></tr></thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id}>
                  <td>{i + 1}</td>
                  <td>{u.name}</td>
                  <td>{u.games_played}</td>
                  <td>{u.wins}</td>
                  <td>{u.best_reaction_ms ?? '—'}</td>
                  <td><button className="mini danger" onClick={() => del(u.id, u.name)}>usun</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
