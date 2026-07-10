// Prosty klient API. W dev: Vite proxy'uje /api -> ESP32 (patrz vite.config.js).
// Na produkcji: ustaw VITE_API_BASE na "http://<IP-ESP32>".
const BASE = import.meta.env.VITE_API_BASE || ''

async function j(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`)
  return res.json()
}

export const api = {
  state:       ()             => j('GET',  '/api/state'),
  sector:      (panel, sector, on, r, g, b) => j('POST', '/api/sector', { panel, sector, on, r, g, b }),
  panel:       (panel, on, r, g, b)         => j('POST', '/api/panel',  { panel, on, r, g, b }),
  offAll:      ()             => j('POST', '/api/offall'),
  bright:      (v)            => j('POST', '/api/bright', { v }),
  round2Start: ()             => j('POST', '/api/round2/start'),
  round2Stop:  ()             => j('POST', '/api/round2/stop'),
  health:      ()             => j('GET',  '/api/health'),
}
