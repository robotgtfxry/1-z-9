// ============================================================
// 1 z 9 — backend Node.js
// - SQLite (users, seats, buttons, round2_results)
// - Odpytuje ESP32 co 300 ms i przechwytuje eventy przyciskow
// - Zapisuje wyniki z przypisanym userem, aktualizuje statystyki
// - JSON API + SSE dla frontendu (React)
// - Proxy komend LED do ESP32
// ============================================================

import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openDb } from './db.js'
import { SOUNDS } from './sounds.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ESP_URL   = process.env.ESP_URL   || 'http://192.168.1.50'
const PORT      = Number(process.env.PORT) || 4000
const DB_PATH   = process.env.DB_PATH   || './data.db'
const POLL_MS   = 300
const PASSWORD  = process.env.OPERATOR_PASSWORD || 'admin'   // <- zmien w .env
const ESP_TOKEN = process.env.ESP_API_TOKEN || '1z9-esp-token'   // musi zgadzac sie z API_TOKEN w ESP

const db = openDb(DB_PATH)
const app = express()
app.use(cors({ exposedHeaders: ['X-Operator-Password'], allowedHeaders: ['Content-Type', 'X-Operator-Password'] }))
app.use(express.json())

// Middleware do endpointow, ktore zmieniaja stan.
// Frontend wysyla haslo w headerze X-Operator-Password.
function requireAuth(req, res, next) {
  if ((req.header('x-operator-password') || '') === PASSWORD) return next()
  res.status(401).json({ err: 'unauthorized' })
}

// Endpoint sprawdzenia hasla (do formularza logowania).
app.post('/api/auth/check', (req, res) => {
  if ((req.body?.password || '') === PASSWORD) return res.json({ ok: true })
  res.status(401).json({ err: 'bad password' })
})

// ---------- Preparowane zapytania ----------
const stmt = {
  listUsers:      db.prepare(`SELECT * FROM users ORDER BY name COLLATE NOCASE`),
  getUser:        db.prepare(`SELECT * FROM users WHERE id = ?`),
  insertUser:     db.prepare(`INSERT INTO users (name, created_at) VALUES (?, ?)`),
  deleteUser:     db.prepare(`DELETE FROM users WHERE id = ?`),
  deleteAllUsers: db.prepare(`DELETE FROM users`),

  getSeats:       db.prepare(`
    SELECT s.seat, u.id AS user_id, u.name, s.lives, s.color
    FROM seats s LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.seat`),
  setSeat:        db.prepare(`UPDATE seats SET user_id = ?, lives = 3 WHERE seat = ?`),
  clearSeatByUser:db.prepare(`UPDATE seats   SET user_id = NULL WHERE user_id = ?`),
  clearAllSeats:  db.prepare(`UPDATE seats   SET user_id = NULL, lives = 3`),
  setLives:       db.prepare(`UPDATE seats SET lives = MAX(0, MIN(3, ?)) WHERE seat = ?`),
  resetAllLives:  db.prepare(`UPDATE seats SET lives = 3`),
  setColor:       db.prepare(`UPDATE seats SET color = ? WHERE seat = ?`),

  getButtons:     db.prepare(`
    SELECT b.button, u.id AS user_id, u.name
    FROM buttons b LEFT JOIN users u ON u.id = b.user_id
    ORDER BY b.button`),
  setButton:      db.prepare(`UPDATE buttons SET user_id = ? WHERE button = ?`),
  clearBtnByUser: db.prepare(`UPDATE buttons SET user_id = NULL WHERE user_id = ?`),
  clearAllButtons:db.prepare(`UPDATE buttons SET user_id = NULL`),

  insertResult:   db.prepare(`
    INSERT INTO round2_results (user_id, button_id, reaction_ms, position, ts, question_id)
    VALUES (?, ?, ?, ?, ?, ?)`),

  bumpGames:      db.prepare(`UPDATE users SET games_played = games_played + 1 WHERE id = ?`),
  bumpWin:        db.prepare(`UPDATE users SET wins = wins + 1 WHERE id = ?`),
  updateBestTime: db.prepare(`
    UPDATE users
    SET best_reaction_ms = CASE
      WHEN best_reaction_ms IS NULL OR ? < best_reaction_ms THEN ? ELSE best_reaction_ms
    END
    WHERE id = ?`),

  leaderboard:    db.prepare(`
    SELECT id, name, games_played, wins, best_reaction_ms
    FROM users
    ORDER BY wins DESC, best_reaction_ms IS NULL, best_reaction_ms ASC, name COLLATE NOCASE
    LIMIT 100`),

  recentResults:  db.prepare(`
    SELECT r.*, u.name
    FROM round2_results r LEFT JOIN users u ON u.id = r.user_id
    ORDER BY r.ts DESC LIMIT ?`),

  // --- pytania ---
  listQuestions:  db.prepare(`SELECT * FROM questions ORDER BY sort_order ASC, id ASC`),
  getQuestion:    db.prepare(`SELECT * FROM questions WHERE id = ?`),
  insertQuestion: db.prepare(`INSERT INTO questions (text, answer, round, created_at, sort_order) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order)+1, 0) FROM questions))`),
  insertQuestionAt: db.prepare(`INSERT INTO questions (text, answer, round, created_at, sort_order) VALUES (?, ?, ?, ?, ?)`),
  maxSortOrder:   db.prepare(`SELECT COALESCE(MAX(sort_order)+1, 0) AS next FROM questions`),
  updateQuestion: db.prepare(`UPDATE questions SET text = ?, answer = ?, round = ? WHERE id = ?`),
  deleteQuestion: db.prepare(`DELETE FROM questions WHERE id = ?`),
  markUsed:       db.prepare(`UPDATE questions SET used = used + 1 WHERE id = ?`),
  setSortOrder:   db.prepare(`UPDATE questions SET sort_order = ? WHERE id = ?`),

  getCurrent:     db.prepare(`SELECT * FROM current_question WHERE id = 1`),
  setCurrentByQ:  db.prepare(`
    UPDATE current_question
    SET question_id = ?, text = ?, answer = ?, round = ?, show_answer = 0, updated_at = ?
    WHERE id = 1`),
  setCurrentText: db.prepare(`
    UPDATE current_question
    SET question_id = NULL, text = ?, answer = ?, round = ?, show_answer = ?, updated_at = ?
    WHERE id = 1`),
  setReveal:      db.prepare(`UPDATE current_question SET show_answer = ?, updated_at = ? WHERE id = 1`),
  clearCurrent:   db.prepare(`
    UPDATE current_question
    SET question_id = NULL, text = NULL, answer = NULL, show_answer = 0, updated_at = ?
    WHERE id = 1`),
}

// ---------- Stan ----------
let espState = null            // ostatni stan pobrany z ESP32
let espOk    = false           // czy jest polaczenie
let recordedEventIds = new Set() // ktore eventy juz zapisalismy w tej rundzie
let round2WasActive = false
const sseClients = new Set()

// ---------- Helpery ----------
async function fetchEsp(path, opts = {}) {
  const headers = { ...(opts.headers || {}), 'X-Api-Token': ESP_TOKEN }
  const res = await fetch(`${ESP_URL}${path}`, { ...opts, headers })
  if (!res.ok) throw new Error(`ESP ${path} -> ${res.status}`)
  return res
}

function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

async function espPost(path, body) {
  try {
    const r = await fetchEsp(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    return r.json()
  } catch (e) { /* ESP moze byc chwilowo offline */ }
}

// Zycia = ilosc swiecacych sektorow. Kolor = kolor stanowiska.
async function syncSeatLeds(seat) {
  const s = stmt.getSeats.all().find(x => x.seat === seat)
  if (!s) return
  const active = s.user_id ? (s.lives ?? 0) : 0
  const { r, g, b } = hexToRgb(s.color || '#e05252')
  if (active === 3) return espPost('/api/panel', { panel: seat, on: true, r, g, b })
  if (active === 0) return espPost('/api/panel', { panel: seat, on: false, r, g, b })
  await Promise.all([0, 1, 2].map(sec =>
    espPost('/api/sector', { panel: seat, sector: sec, on: sec < active, r, g, b })
  ))
}

async function syncAllSeats() {
  for (let i = 0; i < 9; i++) await syncSeatLeds(i)
}

function broadcastSse() {
  const data = `data: ${JSON.stringify({ t: Date.now() })}\n\n`
  for (const res of sseClients) {
    try { res.write(data) } catch { /* client odejdzie w close */ }
  }
}

// Broadcast konkretnego typu eventu SSE (np. 'sound')
function sseSend(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) {
    try { res.write(payload) } catch {}
  }
}

function currentPositions() {
  // Sortuje eventy po czasie -> mapa buttonId -> pozycja (1-based)
  const evs = [...(espState?.events || [])].sort((a, b) => a.t - b.t)
  const pos = new Map()
  evs.forEach((e, i) => pos.set(e.id, i + 1))
  return pos
}

function recordNewEvents() {
  if (!espState || !Array.isArray(espState.events)) return
  const positions = currentPositions()
  const btnRows = stmt.getButtons.all()
  const btnUser = new Map(btnRows.map(r => [r.button, r.user_id]))
  const now = Date.now()
  // Wiaz wynik z aktualnym pytaniem (jesli jest w banku - questionId != NULL)
  const cur = stmt.getCurrent.get()
  const questionId = cur?.question_id ?? null

  db.exec('BEGIN')
  try {
    for (const e of espState.events) {
      const key = `${e.id}:${e.t}`
      if (recordedEventIds.has(key)) continue
      recordedEventIds.add(key)
      const userId = btnUser.get(e.id) ?? null
      const position = positions.get(e.id) ?? 1
      stmt.insertResult.run(userId, e.id, e.t, position, now, questionId)
      if (userId) {
        stmt.bumpGames.run(userId)
        if (position === 1) stmt.bumpWin.run(userId)
        stmt.updateBestTime.run(e.t, e.t, userId)
      }
    }
    db.exec('COMMIT')
  } catch (err) {
    try { db.exec('ROLLBACK') } catch {}
    throw err
  }
}

async function pollLoop() {
  try {
    const r = await fetchEsp('/api/state')
    espState = await r.json()
    if (!espOk) {
      console.log('[esp] polaczono — sync LEDow')
      syncAllSeats()
    }
    espOk = true

    if (espState.round2 && !round2WasActive) {
      recordedEventIds.clear()
    }
    round2WasActive = !!espState.round2

    if (espState.round2) recordNewEvents()

    broadcastSse()
  } catch (e) {
    if (espOk) console.log('[esp] utrata polaczenia:', e.message)
    espOk = false
    broadcastSse()
  }
}
setInterval(pollLoop, POLL_MS)

// ---------- API: uzytkownicy ----------
app.get('/api/users', (req, res) => res.json(stmt.listUsers.all()))

app.post('/api/users', requireAuth, (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name || name.length > 32) return res.status(400).json({ err: 'invalid name' })
  try {
    const info = stmt.insertUser.run(name, Date.now())
    res.json(stmt.getUser.get(info.lastInsertRowid))
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ err: 'exists' })
    res.status(500).json({ err: e.message })
  }
})

app.delete('/api/users/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  stmt.clearSeatByUser.run(id)
  stmt.clearBtnByUser.run(id)
  stmt.deleteUser.run(id)
  res.json({ ok: true })
})

// ---------- API: siedzenia i przyciski ----------
app.get('/api/seats',   (_, res) => res.json(stmt.getSeats.all()))
app.get('/api/buttons', (_, res) => res.json(stmt.getButtons.all()))

app.post('/api/seats/:seat', requireAuth, async (req, res) => {
  const seat = Number(req.params.seat)
  const userId = req.body?.userId ?? null
  if (seat < 0 || seat > 8) return res.status(400).json({ err: 'range' })
  if (userId != null) stmt.clearSeatByUser.run(userId)   // jedno miejsce na usera
  stmt.setSeat.run(userId, seat)
  syncSeatLeds(seat)
  res.json({ ok: true })
})

app.post('/api/seats/:seat/color', requireAuth, async (req, res) => {
  const seat = Number(req.params.seat)
  if (seat < 0 || seat > 8) return res.status(400).json({ err: 'range' })
  const color = String(req.body?.color || '').trim()
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return res.status(400).json({ err: 'bad color' })
  stmt.setColor.run(color, seat)
  syncSeatLeds(seat)
  res.json({ ok: true })
})

app.post('/api/buttons/:button', requireAuth, (req, res) => {
  const button = Number(req.params.button)
  const userId = req.body?.userId ?? null
  if (button < 0 || button > 2) return res.status(400).json({ err: 'range' })
  if (userId != null) stmt.clearBtnByUser.run(userId)
  stmt.setButton.run(userId, button)
  res.json({ ok: true })
})

app.post('/api/seats/reset',   requireAuth, async (_, res) => { stmt.clearAllSeats.run();   syncAllSeats(); res.json({ ok: true }) })
app.post('/api/buttons/reset', requireAuth, (_, res) => { stmt.clearAllButtons.run(); res.json({ ok: true }) })

// Zycia
app.post('/api/seats/:seat/lives', requireAuth, async (req, res) => {
  const seat = Number(req.params.seat)
  if (seat < 0 || seat > 8) return res.status(400).json({ err: 'range' })
  const cur = stmt.getSeats.all().find(s => s.seat === seat)
  const delta = req.body?.delta
  const value = req.body?.value
  let next = cur?.lives ?? 3
  if (typeof delta === 'number') next = next + delta
  else if (typeof value === 'number') next = value
  else return res.status(400).json({ err: 'delta or value required' })
  stmt.setLives.run(next, seat)
  syncSeatLeds(seat)
  res.json({ ok: true })
})

app.post('/api/lives/reset', requireAuth, async (_, res) => { stmt.resetAllLives.run(); syncAllSeats(); res.json({ ok: true }) })

// Pelny reset gry: uzytkownicy, siedzenia, przyciski, pytanie, ledy, runda 2 stop.
// Nie ruszamy: banku pytan, historii round2_results (user_id historycznych wynikow idzie NULL przez FK).
app.post('/api/reset-game', requireAuth, async (_, res) => {
  stmt.clearAllSeats.run()
  stmt.clearAllButtons.run()
  stmt.deleteAllUsers.run()          // FK ustawia round2_results.user_id -> NULL
  stmt.clearCurrent.run(Date.now())
  recordedEventIds.clear()
  espPost('/api/round2/stop')
  espPost('/api/offall')
  await syncAllSeats()
  res.json({ ok: true })
})

// ---------- API: wyniki / leaderboard ----------
app.get('/api/leaderboard', (_, res) => res.json(stmt.leaderboard.all()))
app.get('/api/results/recent', (req, res) =>
  res.json(stmt.recentResults.all(Number(req.query.limit) || 30)))

// ---------- API: pytania ----------
app.get('/api/questions', (_, res) => res.json(stmt.listQuestions.all()))

app.post('/api/questions', requireAuth, (req, res) => {
  const text   = String(req.body?.text || '').trim()
  const answer = req.body?.answer ? String(req.body.answer).trim() : null
  const round  = [1, 2].includes(+req.body?.round) ? +req.body.round : 1
  if (!text) return res.status(400).json({ err: 'text required' })
  const info = stmt.insertQuestion.run(text, answer, round, Date.now())
  res.json(stmt.getQuestion.get(info.lastInsertRowid))
})

app.put('/api/questions/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const q = stmt.getQuestion.get(id)
  if (!q) return res.status(404).json({ err: 'notfound' })
  const text   = req.body?.text != null ? String(req.body.text).trim() : q.text
  const answer = req.body?.answer != null ? String(req.body.answer).trim() : q.answer
  const round  = [1, 2].includes(+req.body?.round) ? +req.body.round : q.round
  stmt.updateQuestion.run(text, answer, round, id)
  res.json(stmt.getQuestion.get(id))
})

app.delete('/api/questions/:id', requireAuth, (req, res) => {
  stmt.deleteQuestion.run(Number(req.params.id))
  res.json({ ok: true })
})

// Import pytan z JSON. Nie kasuje istniejacych - dopisuje na koniec listy.
// Kolejnosc: jesli item ma pole `order`, uzywamy go (offsetowane o MAX istniejacego sort_order).
// W przeciwnym razie stosujemy pozycje w tablicy (0, 1, 2, ...).
app.post('/api/questions/import', requireAuth, (req, res) => {
  const items = Array.isArray(req.body?.questions) ? req.body.questions : null
  if (!items) return res.status(400).json({ err: 'questions array required' })
  const base = stmt.maxSortOrder.get()?.next ?? 0
  let added = 0, skipped = 0
  db.exec('BEGIN')
  try {
    items.forEach((it, i) => {
      const text = String(it?.text || '').trim()
      const answer = it?.answer ? String(it.answer).trim() : null
      const round = [1, 2].includes(+it?.round) ? +it.round : 1
      const orderRaw = Number.isFinite(+it?.order) ? +it.order : i
      const sortOrder = base + orderRaw
      if (!text) { skipped++; return }
      stmt.insertQuestionAt.run(text, answer, round, Date.now(), sortOrder)
      added++
    })
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    return res.status(500).json({ err: e.message })
  }
  res.json({ ok: true, added, skipped })
})

// Ustaw nowa kolejnosc pytan w banku (frontend przekazuje pelna liste id od gory do dolu)
app.post('/api/questions/reorder', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null
  if (!ids || !ids.length) return res.status(400).json({ err: 'ids required' })
  db.exec('BEGIN')
  try {
    ids.forEach((id, i) => stmt.setSortOrder.run(i, id))
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    return res.status(500).json({ err: e.message })
  }
  res.json({ ok: true })
})

// aktualne pytanie
app.get('/api/question', (_, res) => res.json(stmt.getCurrent.get()))

app.post('/api/question', requireAuth, (req, res) => {
  // recznie wpisane pytanie (nie z banku)
  const text   = req.body?.text != null ? String(req.body.text) : null
  const answer = req.body?.answer != null ? String(req.body.answer) : null
  const round  = [1, 2].includes(+req.body?.round) ? +req.body.round : 1
  const show   = req.body?.showAnswer ? 1 : 0
  stmt.setCurrentText.run(text, answer, round, show, Date.now())
  res.json(stmt.getCurrent.get())
})

app.post('/api/question/from/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const q = stmt.getQuestion.get(id)
  if (!q) return res.status(404).json({ err: 'notfound' })
  stmt.setCurrentByQ.run(q.id, q.text, q.answer, q.round, Date.now())
  stmt.markUsed.run(q.id)
  res.json(stmt.getCurrent.get())
})

app.post('/api/question/reveal', requireAuth, (req, res) => {
  stmt.setReveal.run(req.body?.show ? 1 : 0, Date.now())
  res.json(stmt.getCurrent.get())
})

app.post('/api/question/clear', requireAuth, (_, res) => {
  stmt.clearCurrent.run(Date.now())
  res.json(stmt.getCurrent.get())
})

// Nastepne / poprzednie pytanie z banku (zgodnie z sort_order).
// round=1|2 -> zawez do pytan tej rundy; null -> wszystkie.
// Jesli nie ma aktualnego, wybiera pierwsze/ostatnie odpowiednio.
function stepQuestion(dir, round) {
  let list = stmt.listQuestions.all()
  if (round === 1 || round === 2) list = list.filter(q => q.round === round)
  if (!list.length) return null
  const cur = stmt.getCurrent.get()
  const curId = cur?.question_id
  let idx = curId ? list.findIndex(q => q.id === curId) : -1
  if (dir === 'next') idx = idx < 0 ? 0 : Math.min(idx + 1, list.length - 1)
  else                idx = idx < 0 ? list.length - 1 : Math.max(idx - 1, 0)
  const q = list[idx]
  stmt.setCurrentByQ.run(q.id, q.text, q.answer, q.round, Date.now())
  stmt.markUsed.run(q.id)
  return stmt.getCurrent.get()
}

app.post('/api/question/next', requireAuth, (req, res) => {
  const round = [1, 2].includes(+req.query.round) ? +req.query.round : null
  const q = stepQuestion('next', round)
  if (!q) return res.status(404).json({ err: 'no questions' })
  res.json(q)
})
app.post('/api/question/prev', requireAuth, (req, res) => {
  const round = [1, 2].includes(+req.query.round) ? +req.query.round : null
  const q = stepQuestion('prev', round)
  if (!q) return res.status(404).json({ err: 'no questions' })
  res.json(q)
})

// ---------- API: stan (ESP + DB) ----------
app.get('/api/state', (_, res) => {
  const seats = stmt.getSeats.all()
  const buttons = stmt.getButtons.all()
  const positions = currentPositions()
  const btnUser = new Map(buttons.map(b => [b.button, b]))
  const events = (espState?.events || []).map(e => ({
    id: e.id,
    t: e.t,
    position: positions.get(e.id) ?? null,
    userName: btnUser.get(e.id)?.name || null,
  })).sort((a, b) => a.t - b.t)

  const q = stmt.getCurrent.get()
  const question = {
    text: q?.text || null,
    answer: q?.answer || null,
    round: q?.round || 1,
    showAnswer: !!q?.show_answer,
    questionId: q?.question_id || null,
    updatedAt: q?.updated_at || 0,
  }

  res.json({
    espOk,
    round2:      !!espState?.round2,
    brightness:  espState?.brightness ?? 128,
    panels:      espState?.panels || [],
    seats,
    buttons,
    events,
    question,
  })
})

// ---------- SSE ----------
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  res.write(`retry: 2000\n\n`)
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

// ---------- Proxy komend LED ----------
async function proxyPost(path, body) {
  const r = await fetchEsp(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return r.json()
}
app.post('/api/led/sector', requireAuth, async (req, res) => { try { res.json(await proxyPost('/api/sector', req.body)) } catch (e) { res.status(502).json({ err: e.message }) } })
app.post('/api/led/panel',  requireAuth, async (req, res) => { try { res.json(await proxyPost('/api/panel',  req.body)) } catch (e) { res.status(502).json({ err: e.message }) } })
app.post('/api/led/offall', requireAuth, async (req, res) => { try { res.json(await proxyPost('/api/offall'))              } catch (e) { res.status(502).json({ err: e.message }) } })
app.post('/api/led/bright', requireAuth, async (req, res) => { try { res.json(await proxyPost('/api/bright', req.body)) } catch (e) { res.status(502).json({ err: e.message }) } })

app.post('/api/round2/start', requireAuth, async (_, res) => { try { res.json(await proxyPost('/api/round2/start')) } catch (e) { res.status(502).json({ err: e.message }) } })
app.post('/api/round2/stop',  requireAuth, async (_, res) => { try { res.json(await proxyPost('/api/round2/stop'))  } catch (e) { res.status(502).json({ err: e.message }) } })

// ---------- Dzwieki (broadcast SSE) ----------
app.get('/api/sounds', (_, res) => res.json(SOUNDS))

app.post('/api/sound/play', requireAuth, (req, res) => {
  const id = String(req.body?.id || '')
  const s = SOUNDS.find(x => x.id === id)
  if (!s) return res.status(404).json({ err: 'notfound' })
  sseSend('sound', { id: s.id, file: s.file, ts: Date.now() })
  res.json({ ok: true })
})

app.post('/api/sound/stop', requireAuth, (_, res) => {
  sseSend('sound-stop', { ts: Date.now() })
  res.json({ ok: true })
})

// ---------- Serwowanie zbudowanego frontendu (opcjonalne) ----------
// Jesli obok server/ jest wybudowany web/dist/, backend go serwuje.
// Uzywane przez launcher .exe - user otwiera http://<lan-ip>:4000 i dostaje calosc.
const DIST = process.env.WEB_DIST || path.resolve(__dirname, '..', 'web', 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  // SPA fallback: kazda sciezka spoza /api/* -> index.html
  app.get(/^\/(?!api\/).*/, (_, res) => res.sendFile(path.join(DIST, 'index.html')))
  console.log(`[server] Frontend serwowany z ${DIST}`)
}

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`[server] http://0.0.0.0:${PORT}`)
  console.log(`[server] ESP: ${ESP_URL}`)
  console.log(`[server] DB : ${DB_PATH}`)
})
