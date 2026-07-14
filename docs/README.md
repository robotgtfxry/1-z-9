# 1 z 9 — dokumentacja

Sterowanie do gry teleturniejowej "1 z 9". Cztery czesci:

1. **Arduino Uno** — steruje 9 tasmami WS2812B + czyta 3 przyciski rundy 2.
2. **ESP32** (zwykly WROOM-32 DevKit) — WiFi + surowe JSON API do LED / przyciskow.
3. **Backend Node.js + SQLite** — trzyma graczy, wyniki, siedzenia, przechwytuje eventy z ESP.
4. **React + Vite** — panel operatora, prezentacja dla widowni, tablica wynikow, ekrany TV za graczami.

## Struktura repo

```
1-z-9/
├── ARDUINO/1z9-ARDU/          # PlatformIO – Arduino Uno
│   ├── platformio.ini
│   └── src/main.cpp
├── ESP/1z9-ESP/               # PlatformIO – ESP32 (WROOM-32 DevKit)
│   ├── platformio.ini
│   └── src/main.cpp
├── server/                    # Node.js backend
│   ├── package.json
│   ├── index.js               # Express + ESP poller + SSE
│   ├── db.js                  # better-sqlite3 schema
│   └── .env.example
├── web/                       # React + Vite frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example
│   └── src/
│       ├── main.jsx           # BrowserRouter root
│       ├── App.jsx            # routes
│       ├── App.css
│       ├── api.js
│       ├── components/PanelGrid.jsx
│       └── routes/
│           ├── Operator.jsx
│           ├── Rejestracja.jsx
│           ├── Prezentacja.jsx
│           ├── Wyniki.jsx
│           └── Gracz.jsx      # /wyniki/gracz/:seat
└── docs/README.md
```

## Widoki (routing frontend)

| URL                     | Dla kogo                          | Co pokazuje                                          |
|-------------------------|-----------------------------------|------------------------------------------------------|
| `/`                     | Operator (laptop/tablet)          | Kontrola LED, siedzen, przyciskow, pytania + mini prezentacja |
| `/rejestracja`          | Prowadzacy / gracze przed gra     | Formularz + lista graczy z ich statystykami          |
| `/pytania`              | Prowadzacy                        | Bank pytan (dodaj/edytuj/usun) + szybkie "na ekran"  |
| `/prezentacja`          | Widownia (glowny ekran / rzutnik) | Pytanie z badgem rundy, 9 paneli, "kto pierwszy" w rundzie 2 |
| `/wyniki`               | TV pomocniczy / laptop sedziego   | Leaderboard: top 100 po wygranych i najlepszym czasie|

`seat` w URL to indeks 0..8. Dla TV za graczem 1 uzyj `/wyniki/gracz/0`, dla gracza 2 `/wyniki/gracz/1` itd.

## Hardware

### Arduino Uno – pinout

| Pin           | Funkcja                                                   |
|---------------|-----------------------------------------------------------|
| D0 (RX)       | UART ← ESP32 TX (GPIO17). 3.3 V → 5 V wprost, bez konwersji |
| D1 (TX)       | UART → ESP32 RX (GPIO16). **przez level shifter/dzielnik** |
| D2..D10       | 9 tasm WS2812B (DATA), panele 1..9                        |
| A0, A1, A2    | 3 przyciski rundy 2 (styki do GND, INPUT_PULLUP)          |
| D11, D12, D13 | Lampki przyciskow 1/2/3 (masa wspolna, stan HIGH = swieci) |

**UART D0/D1 wspoldziela z USB. Podczas flashowania odlacz linie do ESP32.**

**Lampki przyciskow (D11/D12/D13):** wspolna katoda do GND, anoda kazdej lampki na
pin przez rezystor ~220–330 Ω. Pierwszy nacisniety przycisk w rundzie 2 swieci 5 s,
potem gasnie i uklad sam re-armuje sie na kolejne nacisniecie. Przyciski sa aktywne
od razu po starcie Uno (przed runda 2 sa fizycznie schowane); `ROUND2:START` z ESP
tez resetuje „pierwszego". Pin D13 ma wbudowany LED plytki — bedzie mrugac razem
z lampka „3".

### ESP32 (WROOM-32 DevKit) – pinout

| GPIO    | Funkcja                                                          |
|---------|------------------------------------------------------------------|
| 17 (TX) | Serial2 → Arduino D0/RX. 3.3 V → 5 V zwykle OK **bez** konwersji  |
| 16 (RX) | Serial2 ← Arduino D1/TX. **5 V → 3.3 V: TU level shifter/dzielnik** |
| GND     | Wspolna masa z Uno (obowiazkowo)                                 |

> **Kierunek level shiftera:** konwersji wymaga TYLKO linia Uno D1 (TX, 5 V) →
> ESP GPIO16 (RX, 3.3 V). Odwrotna (ESP GPIO17 3.3 V → Uno D0 5 V) dziala wprost,
> bo Uno czyta 3.3 V jako stan wysoki. Jak masz dwukierunkowy modul TXS0108 /
> BSS138, wpinasz i tak obie linie — to nie szkodzi.
>
> Piny 16/17 sa wolne na **WROOM-32**. Na module **WROVER** (z PSRAM) sa zajete —
> wtedy uzyj np. GPIO25/26 i popraw `LINK_RX`/`LINK_TX` w `ESP/1z9-ESP/src/main.cpp`.

## Zasilanie

- LEDy: ok. 60 mA/dioda przy pelnej bieli. 9 × 30 = 270 LED → do 16 A worst-case. Realnie z jasnoscia 64–128 wystarczy 5 V / 10 A.
- **NIE** zasilaj tylu diod z USB.
- Wspolna masa: PSU LED — Uno GND — ESP32 GND.

## Protokol UART (Uno ↔ ESP, linie CRLF, 115200 8N1)

### ESP → Uno

| Komenda                                | Efekt                                     |
|----------------------------------------|-------------------------------------------|
| `PANEL:<id>:<sector>:<R>,<G>,<B>`      | Ustaw kolor sektora `0..2` panelu `0..8`. |
| `PANEL:<id>:ALL:<R>,<G>,<B>`           | Caly panel na dany kolor.                 |
| `OFF:<id>:<sector>` / `OFF:<id>:ALL`   | Zgas sektor lub caly panel.               |
| `OFFALL`                                | Zgas wszystko.                            |
| `BRIGHT:<0-255>`                        | Globalna jasnosc.                         |
| `ROUND2:START` / `ROUND2:STOP`          | Aktywacja / zamkniecie okna klikniec.     |
| `PING`                                  | → `PONG`                                  |

### Uno → ESP

| Komunikat                | Znaczenie                                             |
|--------------------------|-------------------------------------------------------|
| `READY`                  | Boot Uno.                                             |
| `PONG`                   | Odpowiedz na `PING`.                                  |
| `ROUND2:STARTED/STOPPED` | Potwierdzenie zmiany stanu rundy.                     |
| `BTN:<id>:<ms>`          | Przycisk `id` (0..2) wcisniety po `ms` ms od startu.  |

## Baza danych (SQLite, `server/data.db`)

Powstaje automatycznie przy pierwszym starcie. Schemat:

- `users(id, name UNIQUE, created_at, games_played, wins, best_reaction_ms)`
- `seats(seat 0..8, user_id → users, lives 0..3 domyslnie 3)`
- `buttons(button 0..2, user_id → users)`
- `round2_results(id, user_id, button_id, reaction_ms, position, ts)`
- `questions(id, text, answer, round, used, created_at)` — bank pytan
- `current_question(id=1, question_id?, text, answer, round, show_answer, updated_at)` — pytanie widoczne teraz na prezentacji

Backend przy kazdym evencie `BTN:` z ESP dopisuje wiersz do `round2_results`, zwieksza `users.wins` (jesli pozycja = 1), aktualizuje `best_reaction_ms` i inkrementuje `games_played`.

## JSON API (backend, port `4000`)

### Uzytkownicy
- `GET    /api/users`
- `POST   /api/users` — `{ name }`
- `DELETE /api/users/:id`

### Siedzenia (0..8) i przyciski (0..2)
- `GET  /api/seats`, `POST /api/seats/:seat  { userId }`, `POST /api/seats/reset`
- `GET  /api/buttons`, `POST /api/buttons/:button { userId }`, `POST /api/buttons/reset`

### Zycia (3 na siedzenie, resetowane przy zmianie usera)
- `POST /api/seats/:seat/lives { delta: -1 | 1 }` — zabierz/dodaj zycie
- `POST /api/seats/:seat/lives { value: 0..3 }` — ustaw konkretna wartosc
- `POST /api/lives/reset` — wszystkie siedzenia na 3

### Wyniki
- `GET /api/leaderboard` — top 100 po wygranych, potem po najlepszym czasie
- `GET /api/results/recent?limit=30`

### Stan (agregat ESP + DB)
- `GET /api/state`
  - Zwraca `{ espOk, round2, brightness, panels[9][3], seats[9], buttons[3], events[] }`
  - `events[i]` zawiera `{ id, t, position, userName }`
- `GET /api/stream` — Server-Sent Events, powiadomienie o tick pollera (~300 ms)

### LED (proxy do ESP)
- `POST /api/led/sector { panel, sector, on, r, g, b }`
- `POST /api/led/panel  { panel, on, r, g, b }`
- `POST /api/led/offall`
- `POST /api/led/bright { v }`

### Runda 2
- `POST /api/round2/start` / `POST /api/round2/stop`

### Dzwieki (broadcast do wszystkich kart)
- `GET  /api/sounds` — lista dostepnych dzwiekow (id, label, file, color)
- `POST /api/sound/play { id }` — broadcast SSE event `sound` → wszystkie karty odtwarzaja
- `POST /api/sound/stop` — broadcast `sound-stop` → wszystkie karty przerywaja

Pliki mp3 lezacych w `web/public/sounds/` (patrz `web/public/sounds/README.txt`). Lista dzwiekow jest w `server/sounds.js` — dodaj wpis + wrzuc plik z pasujaca nazwa, restart backendu.

**Latencja**: przycisk → dzwiek na wszystkich klientach ~15–40 ms w LAN. Audio jest preladowane na kazdej karcie od momentu jej otwarcia. Autoplay: przegladarka wymaga pierwszego user gesture — w prawym dolnym rogu pokazuje sie przycisk *"Kliknij aby wlaczyc dzwieki"*, ktory znika po jednym klikniecie (osoba przy prezentacji musi to zrobic raz na starcie).

### Pytania
- `GET  /api/questions` — bank
- `POST /api/questions { text, answer?, round }` — dodaj do banku
- `PUT  /api/questions/:id { text?, answer?, round? }` — edytuj
- `DELETE /api/questions/:id` — usun
- `GET  /api/question` — aktualne pytanie (widoczne w `/api/state.question` tez)
- `POST /api/question { text, answer?, round, showAnswer? }` — ustaw recznie
- `POST /api/question/from/:id` — ustaw z banku (bumpuje `used`)
- `POST /api/question/reveal { show }` — pokaz/ukryj odpowiedz
- `POST /api/question/clear` — zdejmij pytanie z prezentacji

## Uruchomienie od zera

### 1. Arduino Uno

```powershell
cd ARDUINO\1z9-ARDU
pio run -t upload
pio device monitor
```

### 2. ESP32 (WROOM-32 DevKit)

WiFi konfiguruje sie **bez rekompilacji**. Wgraj firmware raz:

```powershell
cd ESP\1z9-ESP
pio run -t upload
```

ESP bez zapisanej/dostepnej sieci (albo gdy przytrzymasz **BOOT** przy resecie)
wystawia WiFi **`1z9-setup`** (haslo `konfiguracja`). Siec docelowa podajesz na dwa sposoby:

**A. Z launchera** (docelowo `.exe`) — podlacz laptop do WiFi `1z9-setup`, w launcherze
w sekcji **„Siec WiFi dla ESP"** wpisz SSID, haslo, IP (`192.168.1.50`) i brame
(`192.168.1.1`), klik **„Wyslij do ESP"**. Potem recznie przelacz laptop z powrotem na siec docelowa.

**B. Z telefonu** (backup) — podlacz telefon do `1z9-setup`, otworz `http://192.168.4.1`,
wpisz te same pola, zapisz.

Po zapisie ESP restartuje sie i laczy z podana siecia pod podanym IP. Sprawdzenie
**bez monitora serial**: `http://<IP>/api/health` → `{"ok":true,...}` = polaczony.

> **Wazne:** podany IP musi zgadzac sie z `ESP_URL` w `server/.env`. ESP pamieta
> **ostatnio** wpisana siec — w nowym miejscu podajesz nowa. **BOOT** przy resecie
> zawsze wymusza tryb `1z9-setup`.

### 3. Backend Node

```powershell
cd server
npm install
cp .env.example .env
```

Wpisz w `.env`:

```
ESP_URL=http://192.168.1.50
PORT=4000
DB_PATH=./data.db
OPERATOR_PASSWORD=1z9-admin
```

**Haslo operatora**: chroni wszystkie mutujace endpointy (`/api/led/*`, `/api/round2/*`, `/api/seats/*`, `/api/buttons/*`, `/api/question*`, `/api/users` POST/DELETE, `/api/questions*` POST/PUT/DELETE). Widoki `/prezentacja` i `/wyniki` sa publiczne (tylko GET). Frontend przechowuje haslo w `localStorage` pod kluczem `1z9.password` — logout w prawym gornym rogu nawigacji.

**Token do ESP32** (`ESP_API_TOKEN`): backend dosyla go w naglowku `X-Api-Token` przy kazdej komendzie do ESP. ESP odrzuca POSTy bez wlasciwego tokenu, wiec ktos w LAN nie zmieni scene omijajac backend. **Wartosc musi zgadzac sie z `API_TOKEN` w [ESP/1z9-ESP/src/main.cpp](../ESP/1z9-ESP/src/main.cpp).** Zmien oba przed produkcja.

Odpal:

```powershell
npm run dev
```

Powinno wypisac `[server] http://localhost:4000` i po chwili `[esp] polaczono`.

### 4. Frontend React

```powershell
cd web
npm install
cp .env.example .env
npm run dev
```

Vite proxyuje `/api` → `http://localhost:4000`, wiec wystarczy otworzyc `http://localhost:5173`.

## Uruchomienie na finalowym zestawie

W dzien produkcji chcesz miec:
- Laptop operatora → `/` (Chrome/Firefox)
- Rzutnik/duzy TV z widownia → `/prezentacja` (F11 dla fullscreen)
- Opcjonalnie pomocniczy TV/monitor sedziego → `/wyniki`

Wszystkie ekrany laduja z tego samego backendu. Ustaw stale IP dla ESP32 (statyczne w routerze) i uruchom backend na jednej maszynie, ktora jest w tej samej sieci. Reszta urzadzen otwiera po prostu URL frontendu.

Build produkcyjny frontendu:

```powershell
cd web
$env:VITE_API_BASE="http://<IP-BACKENDU>:4000"
npm run build
```

`dist/` mozesz zhostowac np. przez `npx serve dist` lub nginxem.

## Roadmap

- Autoryzacja panelu (proste haslo w headerze) — inaczej ktokolwiek w sieci zmieni scene.
- Efekty animowane w LEDach: odliczanie, blysk zwyciezcy, animacja odpadania.
- Historia gier: eksport CSV / PDF, statystyki sezonu.
- Reset rundy z UI (obecnie DB nie kasuje zapisow — wystarczy usunac `data.db` na czysty stan).
