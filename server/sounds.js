// Konfiguracja dzwiekow ladowana z JSON (sciezka wskazywana przez SOUNDS_CONFIG env,
// domyslnie ./sounds.json obok index.js). Launcher w Tkinterze zapisuje ten plik.
// Format:
//   { "slots": { "1": "C:\\path\\to\\1.mp3", "2": null, ... "9": "..." } }
// 9 slotow (1..9). Pusty slot = brak dzwieku.

import fs from 'node:fs'
import path from 'node:path'

let CONFIG_PATH = null

export function setSoundsConfigPath(p) { CONFIG_PATH = p }

function readConfig() {
  if (!CONFIG_PATH || !fs.existsSync(CONFIG_PATH)) return { slots: {} }
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) || { slots: {} } }
  catch { return { slots: {} } }
}

// Zwraca liste 9 slotow z metadanymi.
export function loadSounds() {
  const cfg = readConfig()
  const slots = cfg.slots || {}
  return Array.from({ length: 9 }, (_, i) => {
    const key = String(i + 1)
    const filePath = slots[key]
    const present = !!(filePath && fs.existsSync(filePath))
    return {
      id:      key,          // "1".."9"
      slot:    i + 1,        // liczbowo
      label:   key,          // do wyswietlenia (numer, nazw juz nie ma)
      present,
    }
  })
}

// Zwraca sciezke do pliku dla danego slotu (albo null jesli brak).
export function getSoundPath(slot) {
  const cfg = readConfig()
  const p = cfg.slots?.[String(slot)]
  if (!p || !fs.existsSync(p)) return null
  return path.resolve(p)
}
