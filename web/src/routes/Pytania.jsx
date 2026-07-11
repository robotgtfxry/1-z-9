import { useEffect, useState } from 'react'
import { api, subscribeState } from '../api'

// Bank pytan. Operator moze przygotowac liste przed gra i podczas trwania
// jednym kliknieciem ustawiac aktualne pytanie w prezentacji.

export default function Pytania() {
  const [items, setItems] = useState([])
  const [current, setCurrent] = useState(null)
  const [form, setForm] = useState({ text: '', answer: '', round: 1 })
  const [err, setErr] = useState(null)

  const refresh = async () => {
    try {
      setItems(await api.questions())
      const s = await api.state(); setCurrent(s.question)
      setErr(null)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => {
    refresh()
    return subscribeState(s => setCurrent(s.question))
  }, [])

  const add = async (e) => {
    e.preventDefault()
    if (!form.text.trim()) return
    try { await api.addQuestion(form.text.trim(), form.answer.trim() || null, +form.round)
          setForm({ text: '', answer: '', round: form.round }); refresh() }
    catch (e) { setErr(e.message) }
  }
  const useIt   = async (id) => { await api.useQuestion(id); refresh() }
  const del     = async (id) => { if (confirm('Usunac?')) { await api.delQuestion(id); refresh() } }
  const editRow = async (q) => {
    const text = prompt('Tresc:', q.text); if (text == null) return
    const answer = prompt('Odpowiedz:', q.answer || '') ?? q.answer
    const round = +(prompt('Runda (1/2):', q.round) || q.round)
    await api.editQuestion(q.id, { text, answer, round }); refresh()
  }

  return (
    <div className="page">
      <h1>Bank pytan</h1>
      {err && <div className="err">{err}</div>}

      <section className="card">
        <h2 className="h">Aktualne pytanie</h2>
        {current?.text ? (
          <div className="q-current">
            <span className={`badge r${current.round}`}>RUNDA {current.round}</span>
            <div className="q-text">{current.text}</div>
            {current.answer && (
              <div className="q-answer">
                Odpowiedz: <b>{current.showAnswer ? current.answer : '••••••'}</b>
              </div>
            )}
            <div className="row">
              <button className="btn" onClick={() => api.reveal(!current.showAnswer).then(refresh)}>
                {current.showAnswer ? 'Ukryj odpowiedz' : 'Odslon odpowiedz'}
              </button>
              <button className="btn off" onClick={() => api.clearQuestion().then(refresh)}>Zdejmij pytanie</button>
            </div>
          </div>
        ) : <p className="muted">Brak — wybierz z listy lub dodaj nowe.</p>}
      </section>

      <form className="card" onSubmit={add}>
        <h2 className="h">Nowe pytanie</h2>
        <div className="q-form">
          <textarea placeholder="Tresc pytania" rows={2}
                    value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} />
          <input placeholder="Odpowiedz (opcjonalna)"
                 value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} />
          <select value={form.round} onChange={e => setForm({ ...form, round: +e.target.value })}>
            <option value={1}>Runda 1</option>
            <option value={2}>Runda 2</option>
          </select>
          <button className="btn go">Dodaj do banku</button>
        </div>
      </form>

      <section className="card">
        <h2 className="h">Bank ({items.length})</h2>
        {items.length === 0 ? <p className="muted">Bank jest pusty.</p> : (
          <table className="tbl">
            <thead><tr><th>#</th><th>R</th><th>Tresc</th><th>Odpowiedz</th><th>Uzyte</th><th /></tr></thead>
            <tbody>
              {items.map((q, i) => {
                const active = current?.questionId
                  ? current.questionId === q.id
                  : !!(current?.text && current.text.trim() === q.text.trim())
                const hasAnswer = !!(current?.answer && current.answer.trim())
                return (
                  <tr key={q.id} className={active ? 'active' : ''}>
                    <td>{i + 1}</td>
                    <td><span className={`badge r${q.round}`}>R{q.round}</span></td>
                    <td className="q-cell">{q.text}</td>
                    <td className="muted">{q.answer || '—'}</td>
                    <td>{q.used}</td>
                    <td className="actions">
                      {active ? (
                        <>
                          <button className="btn off" onClick={() => api.clearQuestion().then(refresh)}>zdejmij</button>
                          <button className="btn" onClick={() => api.reveal(!current.showAnswer).then(refresh)}>
                            {current.showAnswer ? 'ukryj odpowiedz' : 'odslon odpowiedz'}
                          </button>
                        </>
                      ) : (
                        <button className="btn go" onClick={() => useIt(q.id)}>na ekran</button>
                      )}
                      <button className="mini" onClick={() => editRow(q)}>edytuj</button>
                      <button className="mini danger" onClick={() => del(q.id)}>usun</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
