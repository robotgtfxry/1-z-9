import { useEffect, useRef, useState } from 'react'
import { api, subscribeState } from '../api'

// Bank pytan. Kolejnosc reguluje operator drag-and-dropem po uchwycie z lewej.
// Kolejnosc gora->dol odpowiada temu, w jakiej kolejnosci "Nastepne" pytanie
// bedzie pojawiac sie na prezentacji.

export default function Pytania() {
  const [items, setItems] = useState([])
  const [current, setCurrent] = useState(null)
  const [form, setForm] = useState({ text: '', answer: '', round: 1 })
  const [err, setErr] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const dragging = useRef(false)

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

  // ---- EXPORT / IMPORT JSON ----
  const exportJson = () => {
    const data = {
      exported_at: new Date().toISOString(),
      version: 1,
      questions: items.map((q, i) => ({ order: i, round: q.round, text: q.text, answer: q.answer })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    a.href = url; a.download = `1z9-pytania-${stamp}.json`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const list = Array.isArray(parsed) ? parsed
                 : Array.isArray(parsed.questions) ? parsed.questions
                 : null
      if (!list) { setErr('Zły format — oczekuje tablicy albo { questions: [...] }'); return }
      const r = await api.importQuestions(list)
      setErr(null)
      alert(`Import: dodano ${r.added}, pominieto ${r.skipped}`)
      refresh()
    } catch (e) { setErr(`Import: ${e.message}`) }
  }
  const onImportFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''      // reset — pozwala reimport tego samego pliku
    importJson(f)
  }

  // ---- DRAG & DROP ----
  const onDragStart = (id) => (e) => {
    dragging.current = true
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))
  }
  const onDragOver = (id) => (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overId !== id) setOverId(id)
  }
  const onDrop = (targetId) => async (e) => {
    e.preventDefault()
    const srcId = dragId ?? Number(e.dataTransfer.getData('text/plain'))
    setDragId(null); setOverId(null); dragging.current = false
    if (!srcId || srcId === targetId) return
    const src = items.findIndex(x => x.id === srcId)
    const dst = items.findIndex(x => x.id === targetId)
    if (src < 0 || dst < 0) return
    const next = [...items]
    const [moved] = next.splice(src, 1)
    next.splice(dst, 0, moved)
    setItems(next)                           // optimistic
    try { await api.reorderQuestions(next.map(q => q.id)) }
    catch (e) { setErr(e.message); refresh() }
  }
  const onDragEnd = () => { setDragId(null); setOverId(null); dragging.current = false }

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
        <div className="q-op-header">
          <h2 className="h">Bank ({items.length}) <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>— przeciagnij wiersz za uchwyt aby zmienic kolejnosc</span></h2>
          <div className="row" style={{ gap: '.35rem' }}>
            <button className="mini" onClick={exportJson} disabled={items.length === 0} title="Pobierz plik JSON z pytaniami">Eksport JSON</button>
            <label className="mini" style={{ cursor: 'pointer' }} title="Wczytaj plik JSON — dopisze do banku">
              Import JSON
              <input type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
        {items.length === 0 ? <p className="muted">Bank jest pusty.</p> : (
          <table className="tbl">
            <thead><tr><th /><th>#</th><th>R</th><th>Tresc</th><th>Odpowiedz</th><th /></tr></thead>
            <tbody>
              {items.map((q, i) => {
                const active = current?.questionId
                  ? current.questionId === q.id
                  : !!(current?.text && current.text.trim() === q.text.trim())
                const isDragging = dragId === q.id
                const isOver     = overId === q.id && dragId !== q.id
                return (
                  <tr key={q.id}
                      className={`${active ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${isOver ? 'drop-target' : ''}`}
                      onDragOver={onDragOver(q.id)}
                      onDrop={onDrop(q.id)}
                      onDragEnd={onDragEnd}>
                    <td className="drag-handle"
                        draggable
                        onDragStart={onDragStart(q.id)}
                        title="Przeciagnij, aby zmienic kolejnosc">⋮⋮</td>
                    <td>{i + 1}</td>
                    <td><span className={`badge r${q.round}`}>R{q.round}</span></td>
                    <td className="q-cell">{q.text}</td>
                    <td className="muted">{q.answer || '—'}</td>
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
