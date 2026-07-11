# Launcher .exe — jak zbudowac i uruchomic

Launcher w Pythonie / Tkinter uruchamia serwer Node (ktory serwuje tez zbudowany
frontend React) i pokazuje operatorowi adres LAN. Po zbudowaniu do `.exe` mozna
przeniesc plik na inne urzadzenie i odpalic bez konfiguracji.

## Uruchomienie ze zrodel (debug)

```powershell
python launcher.py
```

Wymaga:
- Python 3.10+
- Zainstalowany Node.js (`node` w PATH) — albo `node\node.exe` obok launchera
- Zbudowany frontend: `cd web && npm run build` (tworzy `web\dist`)
- Zainstalowane deps backendu: `cd server && npm install`

## Build do jednego .exe (Windows)

### Krok 1 — portable Node (opcjonalny, ale zalecany dla portability)

Pobierz z https://nodejs.org/en/download binarke **Windows Binary (.zip)**
(np. `node-v22.x.x-win-x64.zip`). Wypakuj i przekopiuj **tylko** plik
`node.exe` do:

```
1-z-9\node\node.exe
```

Bez tego `.exe` bedzie wymagal, zeby Node byl zainstalowany na docelowej maszynie.

### Krok 2 — build

W rootzie projektu:

```powershell
.\build.bat
```

Skrypt:
1. Instaluje deps frontendu i buduje go do `web\dist`
2. Instaluje deps backendu w `server\node_modules`
3. Instaluje `pyinstaller` przez pip
4. Pakuje wszystko do `dist\1z9.exe`

Jesli w `node\` jest `node.exe`, dorzuca go do bundla — plik bedzie ok. 40–60 MB,
ale w pelni portowalny. Bez portable Node — plik ma ~20 MB, ale wymaga
zainstalowanego Node.js na docelowej maszynie.

### Krok 3 — dystrybucja

Kopiujesz `dist\1z9.exe` na docelowa maszyne. Odpalasz. Launcher:
- Pokazuje adres LAN (np. `http://192.168.1.13:4000`)
- Klik **START serwera** — backend startuje, serwujac frontend na tym samym porcie
- Klik **Otworz w przegladarce** — otwiera panel operatora
- Inne urzadzenia w LAN (rzutnik, telefony operatora, ESP32) laduja z tego samego URL

Baza SQLite (`data.db`) tworzy sie w tym samym katalogu co `.exe` — jest
persystentna. Aby zaczac od zera, usun `data.db`.

## Struktura po rozpakowaniu bundla

PyInstaller `--onefile` rozpakowuje zasoby do tymczasowego katalogu
(`sys._MEIPASS`), a `data.db` idzie do katalogu z `.exe`. Struktura wewnetrzna
bundla:

```
_MEIPASS/
├── server/
│   ├── index.js
│   ├── db.js
│   ├── sounds.js
│   ├── package.json
│   └── node_modules/
├── web/dist/
│   ├── index.html
│   ├── assets/...
├── node/
│   └── node.exe        (jesli bundlowany)
```

## Rozwiazywanie problemow

- **"Nie znaleziono Node.js"** — dorzuc `node\node.exe` przed buildem, albo zainstaluj Node.js na docelowej maszynie
- **Ekran startowy pusty** — nie zbudowany `web\dist`, uruchom `npm run build` w folderze `web`
- **`ECONNREFUSED` z ESP** — sprawdz `server\.env`, wpisz IP swojej plytki i uruchom launcher ponownie
- **Port 4000 zajety** — zmien port w `launcher.py` (`DEFAULT_PORT = 4000`) i przebuduj
- **`.exe` mule powolo** — antywirus skanuje `--onefile`. Rozwazaj `--onedir` (wolniejszy build, szybszy start, folder zamiast pliku)
