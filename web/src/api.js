// Klient API. W dev: Vite proxy'uje /api -> backend Node.
// Produkcja: ustaw VITE_API_BASE na URL backendu.
const BASE = import.meta.env.VITE_API_BASE || ''

const AUTH_KEY = '1z9.password'
export const auth = {
  get:    () => localStorage.getItem(AUTH_KEY) || '',
  set:    (p) => localStorage.setItem(AUTH_KEY, p),
  clear:  () => localStorage.removeItem(AUTH_KEY),
  has:    () => !!localStorage.getItem(AUTH_KEY),
}

async function j(method, path, body) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  const pass = auth.get()
  if (pass) headers['X-Operator-Password'] = pass

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    auth.clear()
    throw new Error('unauthorized')
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`${method} ${path} -> ${res.status} ${t}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export async function checkPassword(password) {
  const res = await fetch(`${BASE}/api/auth/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res.ok
}

export const api = {
  // stan (ESP + DB)
  state:       () => j('GET', '/api/state'),
  stream:      () => new EventSource(`${BASE}/api/stream`),

  // uzytkownicy
  users:       () => j('GET',    '/api/users'),
  addUser:     (name) => j('POST', '/api/users', { name }),
  deleteUser:  (id) => j('DELETE', `/api/users/${id}`),

  // siedzenia (0..8)
  seats:       () => j('GET',  '/api/seats'),
  setSeat:     (seat, userId) => j('POST', `/api/seats/${seat}`, { userId }),
  resetSeats:  () => j('POST', '/api/seats/reset'),

  // zycia (R1)
  addLife:     (seat) => j('POST', `/api/seats/${seat}/lives`, { delta:  1 }),
  loseLife:    (seat) => j('POST', `/api/seats/${seat}/lives`, { delta: -1 }),
  setLives:    (seat, value) => j('POST', `/api/seats/${seat}/lives`, { value }),
  resetLives:  ()     => j('POST', '/api/lives/reset'),

  // punkty (R2)
  addPoint:    (seat) => j('POST', `/api/seats/${seat}/points`, { delta:  1 }),
  losePoint:   (seat) => j('POST', `/api/seats/${seat}/points`, { delta: -1 }),
  setPoints:   (seat, value) => j('POST', `/api/seats/${seat}/points`, { value }),
  resetPoints: ()     => j('POST', '/api/points/reset'),

  // kolor stanowiska (jeden na siedzenie, zycia sterują sektorami)
  setSeatColor:(seat, color) => j('POST', `/api/seats/${seat}/color`, { color }),

  // pelen reset gry (siedzenia + przyciski + pytanie + LEDy)
  resetGame:   ()      => j('POST', '/api/reset-game'),

  // przyciski rundy 2 (0..2)
  buttons:     () => j('GET',  '/api/buttons'),
  setButton:   (button, userId) => j('POST', `/api/buttons/${button}`, { userId }),
  resetButtons:() => j('POST', '/api/buttons/reset'),

  // leaderboard
  leaderboard: () => j('GET', '/api/leaderboard'),
  recent:      (limit = 30) => j('GET', `/api/results/recent?limit=${limit}`),

  // LED (backend proxyuje do ESP)
  sector:      (panel, sector, on, r, g, b) => j('POST', '/api/led/sector', { panel, sector, on, r, g, b }),
  panel:       (panel, on, r, g, b)         => j('POST', '/api/led/panel',  { panel, on, r, g, b }),
  offAll:      () => j('POST', '/api/led/offall'),
  bright:      (v) => j('POST', '/api/led/bright', { v }),

  // runda 2
  round2Start: () => j('POST', '/api/round2/start'),
  round2Stop:  () => j('POST', '/api/round2/stop'),
  markCorrect: () => j('POST', '/api/round2/mark', { verdict: 'correct' }),
  markWrong:   () => j('POST', '/api/round2/mark', { verdict: 'wrong' }),
  resetVerdicts: () => j('POST', '/api/round2/reset-verdicts'),

  // pytania - bank
  questions:   ()          => j('GET',    '/api/questions'),
  addQuestion: (text, answer, round) => j('POST',   '/api/questions', { text, answer, round }),
  editQuestion:(id, patch) => j('PUT',    `/api/questions/${id}`, patch),
  delQuestion: (id)        => j('DELETE', `/api/questions/${id}`),
  reorderQuestions: (ids)  => j('POST',   '/api/questions/reorder', { ids }),
  importQuestions: (questions) => j('POST', '/api/questions/import', { questions }),

  // nawigacja: nastepne/poprzednie z banku (opcjonalnie zawezone do rundy)
  nextQuestion: () => j('POST', '/api/question/next'),
  prevQuestion: () => j('POST', '/api/question/prev'),
  setRound:     (round) => j('POST', '/api/round/set', { round }),

  // pytania - aktualne
  setQuestion: (text, answer, round, showAnswer = false) => j('POST', '/api/question', { text, answer, round, showAnswer }),
  useQuestion: (id)     => j('POST', `/api/question/from/${id}`),
  reveal:      (show)   => j('POST', '/api/question/reveal', { show }),
  clearQuestion: ()     => j('POST', '/api/question/clear'),

  // dzwieki
  sounds:      ()      => j('GET',  '/api/sounds'),
  playSound:   (id)    => j('POST', '/api/sound/play', { id }),
  stopSound:   ()      => j('POST', '/api/sound/stop'),
}

export const SSE_URL = `${BASE}/api/stream`

// Hook helper - subskrybuje SSE i wola callback z aktualnym stanem po evencie.
// Fallback: polling co 700 ms.
export function subscribeState(onState) {
  let alive = true
  let es = null
  const tick = async () => {
    try {
      const s = await api.state()
      if (alive) onState(s)
    } catch { /* pomijamy */ }
  }

  try {
    es = api.stream()
    es.onmessage = tick
    es.onerror  = () => { /* auto-reconnect */ }
  } catch { /* brak SSE */ }

  tick()
  const id = setInterval(tick, es ? 1500 : 700)

  return () => { alive = false; clearInterval(id); es?.close?.() }
}
