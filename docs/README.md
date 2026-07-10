# 1 z 9 — dokumentacja

Sterowanie do gry "1 z 9": 9 paneli LED (adresowalne, po 3 sektory) + 3 przyciski w rundzie 2. Trzy elementy oprogramowania: Arduino Uno (hardware), ESP32-S3 (WiFi + API), React (panel operatora).

## Struktura repo

```
1-z-9/
├── ARDUINO/1z9-ARDU/       # PlatformIO – Arduino Uno
│   ├── platformio.ini
│   └── src/main.cpp
├── ESP/1z9-ESP/            # PlatformIO – Adafruit Metro ESP32-S3
│   ├── platformio.ini
│   └── src/main.cpp
├── web/                    # React + Vite – panel operatora
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── App.css
│       └── api.js
└── docs/README.md
```

## Sprzet

- **Arduino Uno R3** — steruje LEDami i przyciskami.
- **Adafruit Metro ESP32-S3** — WiFi, hosti JSON API, gada z Uno przez UART.
- **Level shifter** bidirectional (np. TXS0108E albo dzielnik napiecia) — miedzy Uno (5 V) a ESP32-S3 (3.3 V).
- **9 tasm WS2812B** — jedna na panel, kazda dzielona na 3 sektory logicznie (domyslnie 10 LED / sektor → 30 LED / panel; zmien `LEDS_PER_SECTOR` w `main.cpp`).
- **3 przyciski arcade** — dla 3 finalistow.
- **Zasilacz 5 V** — osobno dla LEDow; masa wspolna z Arduino.

## Pinout — Arduino Uno

| Pin        | Funkcja                                    |
|------------|--------------------------------------------|
| D0 (RX)    | UART <- ESP32-S3 TX (przez level shifter)  |
| D1 (TX)    | UART -> ESP32-S3 RX (przez level shifter)  |
| D2..D10    | 9 tasm WS2812B (DATA) - panele 1..9        |
| A0, A1, A2 | 3 przyciski rundy 2 (do GND, INPUT_PULLUP) |

**Uwaga:** UART (D0/D1) jest wspoldzielony z USB. **Podczas flashowania odlacz linie do ESP32.** Po flashowaniu podlacz ponownie.

## Pinout — ESP32-S3 (Adafruit Metro)

| Pin GPIO | Funkcja                                    |
|----------|--------------------------------------------|
| GPIO 43  | TX (Serial1) -> Uno RX (przez level shifter) |
| GPIO 44  | RX (Serial1) <- Uno TX (przez level shifter) |
| GND      | GND wspolna                                |

## Zasilanie

- LEDy licz ok. 60 mA na diode przy pelnej bieli. 9 × 30 = 270 LED → do 16 A worst-case. Realnie z jasnoscia 64–128 wystarczy 5 V / 10 A.
- **NIE** zasilaj tylu diod z USB.
- Wspolna masa: PSU LED — Uno GND — ESP32 GND.

## Protokol UART (linie CRLF, 115200 8N1)

### ESP32 -> Uno

| Komenda                                | Efekt                                         |
|----------------------------------------|-----------------------------------------------|
| `PANEL:<id>:<sector>:<R>,<G>,<B>`      | Ustaw kolor sektora `0..2` panelu `0..8`.     |
| `PANEL:<id>:ALL:<R>,<G>,<B>`           | Cały panel na dany kolor.                     |
| `OFF:<id>:<sector>` / `OFF:<id>:ALL`   | Zgas sektor lub caly panel.                   |
| `OFFALL`                                | Zgas wszystko.                                |
| `BRIGHT:<0-255>`                        | Globalna jasnosc.                             |
| `ROUND2:START` / `ROUND2:STOP`          | Aktywacja / zamkniecie okna klikniec.         |
| `PING`                                  | -> `PONG`                                     |

### Uno -> ESP32

| Komunikat                | Znaczenie                                             |
|--------------------------|-------------------------------------------------------|
| `READY`                  | Boot Uno.                                             |
| `PONG`                   | Odpowiedz na `PING`.                                  |
| `ROUND2:STARTED/STOPPED` | Potwierdzenie zmiany stanu rundy.                     |
| `BTN:<id>:<ms>`          | Gracz `id` (0..2) wcisnal po `ms` ms od startu rundy. |

## JSON API (ESP32, port 80)

CORS: `Access-Control-Allow-Origin: *`.

| Metoda / URL             | Body                                     | Odpowiedz |
|--------------------------|------------------------------------------|-----------|
| `GET  /api/state`        | -                                        | `{ round2, brightness, panels[9][3], events[], numPanels, sectorsPerPanel, numButtons }` |
| `POST /api/sector`       | `{ panel, sector, on, r, g, b }`         | `{ ok }`  |
| `POST /api/panel`        | `{ panel, on, r, g, b }`                 | `{ ok }`  |
| `POST /api/offall`       | -                                        | `{ ok }`  |
| `POST /api/bright`       | `{ v }`                                  | `{ ok }`  |
| `POST /api/round2/start` | -                                        | `{ ok }`  |
| `POST /api/round2/stop`  | -                                        | `{ ok }`  |
| `GET  /api/health`       | -                                        | `{ ok, ip, rssi, uptimeMs }` |

## Uruchomienie

### Arduino (PlatformIO)

```powershell
cd ARDUINO\1z9-ARDU
pio run -t upload
pio device monitor
```

Wymaga `FastLED` — PlatformIO scia̋gnie z `lib_deps`.

### ESP32-S3 (PlatformIO)

1. W `ESP\1z9-ESP\src\main.cpp` uzupelnij `WIFI_SSID` i `WIFI_PASS`.
2. Flashuj:

   ```powershell
   cd ESP\1z9-ESP
   pio run -t upload
   pio device monitor
   ```

3. W monitorze zobaczysz IP. Zapisz je — potrzebne dla web.

### Web (React + Vite)

```powershell
cd web
npm install
cp .env.example .env
```

Edytuj `.env` i wpisz IP ESP32:

```
VITE_ESP_URL=http://192.168.1.50
```

Odpal dev serwer:

```powershell
npm run dev
```

Otworz `http://localhost:5173`. Vite proxy'uje `/api` -> ESP32.

Build produkcyjny (`npm run build`) zbuduje `dist/` — mozesz to hostowac gdziekolwiek (Netlify, nginx, `python -m http.server dist`). Na prodzie ustaw `VITE_API_BASE=http://<IP-ESP32>` w `.env` przed buildem.

## Roadmap

- WebSocket / SSE zamiast pollingu (na razie GET /api/state co 500 ms).
- Konfiguracja WiFi z portalem AP (`WiFiManager`) zamiast hardcode.
- Efekty: odliczanie startu, blysk zwyciezcy, animowany zbior "wygrala odpowiedz".
- Autoryzacja panelu (proste haslo w headerze) — inaczej ktokolwiek w sieci zmieni scene.
- Ekran dla widowni na osobnym urzadzeniu (drugi wariant frontu).
