import { useState } from 'react'
import { auth, checkPassword } from '../api'

// Prosty gate na widoki operatora: pyta o haslo, waliduje w backendzie,
// trzyma je w localStorage (klucz "1z9.password").
// Publiczne widoki (Prezentacja, Wyniki) NIE uzywaja tego wrapperu.

export default function Protected({ children }) {
  const [ok, setOk] = useState(auth.has())
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  if (ok) return children

  const submit = async (e) => {
    e.preventDefault()
    if (!pwd) return
    setBusy(true); setErr(null)
    try {
      const good = await checkPassword(pwd)
      if (!good) { setErr('Bledne haslo'); return }
      auth.set(pwd)
      setOk(true)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page login-page">
      <form className="login card" onSubmit={submit}>
        <h1>Panel operatora</h1>
        <p className="muted">Wpisz haslo, zeby uzyskac dostep.</p>
        <input type="password" autoFocus placeholder="Haslo"
               value={pwd} onChange={e => setPwd(e.target.value)} />
        {err && <div className="err">{err}</div>}
        <button className="btn go" disabled={busy}>{busy ? '...' : 'Zaloguj'}</button>
      </form>
    </div>
  )
}
