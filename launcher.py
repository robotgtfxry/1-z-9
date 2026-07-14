"""
1 z 9 — launcher w Tkinter.
Uruchamia backend Node (który serwuje też zbudowany frontend web/dist/)
i pokazuje adres LAN, pod którym operator, prezentacja i wyniki będą dostępne.

Struktura oczekiwana obok launcher.py (albo obok launcher.exe po zbudowaniu):
    launcher.py / launcher.exe
    node/
        node.exe         <- portable Node (opcjonalnie; jesli brak, uzywa 'node' z PATH)
    server/
        index.js
        package.json
        node_modules/    <- zainstalowane express, cors
        .env             <- opcjonalny
    web/
        dist/            <- zbudowany frontend (npm run build)

Uruchomienie z zrodel:
    python launcher.py

Zbudowanie do .exe: patrz build.bat.
"""

import json
import os
import queue
import shutil
import socket
import subprocess
import sys
import threading
import tkinter as tk
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext

# ---------------- Sciezki ----------------

def app_dir() -> Path:
    """Katalog gdzie lezy launcher (w developmencie lub obok .exe)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(sys.argv[0]).resolve().parent

def resource_dir() -> Path:
    """
    Katalog z zasobami. W trybie PyInstaller onefile bundle jest wypakowany do sys._MEIPASS.
    W trybie deweloperskim resource = obok launchera.
    """
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return app_dir()

APP_DIR = app_dir()               # obok .exe (tam ladujemy data.db)
RES_DIR = resource_dir()          # obok .py, albo _MEIPASS w bundlu
SERVER_DIR = RES_DIR / "server"
WEB_DIST   = RES_DIR / "web" / "dist"
BUNDLED_NODE = RES_DIR / "node" / "node.exe"
DB_PATH = APP_DIR / "data.db"     # persystentnie obok launchera
SOUNDS_JSON = APP_DIR / "sounds.json"  # konfiguracja slotow dzwiekowych
WIFI_JSON = APP_DIR / "wifi.json"      # ostatnio wpisana siec dla ESP (SSID/IP/brama)
ESP_AP_URL = "http://192.168.4.1"      # adres ESP w trybie konfiguracji (AP "1z9-setup")
DEFAULT_PORT = 4000
AUDIO_EXTS = [("Pliki dzwiekowe", "*.mp3 *.wav *.ogg *.m4a *.flac"), ("Wszystkie pliki", "*.*")]

# ---------------- Node & sieć ----------------

def find_node() -> str | None:
    if BUNDLED_NODE.exists():
        return str(BUNDLED_NODE)
    return shutil.which("node")

def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1.0)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"

# ---------------- GUI ----------------

class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.proc: subprocess.Popen | None = None
        self.log_q: queue.Queue[str] = queue.Queue()
        self.port = DEFAULT_PORT
        self.lan_ip = get_lan_ip()
        self._build_ui()
        self.root.after(80, self._pump_log)

    def _build_ui(self):
        self.root.title("1 z 9 — launcher")
        self.root.geometry("900x760")
        self.root.configure(bg="#0d0e12")

        # ---- Nagłówek ----
        head = tk.Frame(self.root, bg="#0d0e12", padx=14, pady=12)
        head.pack(fill="x")
        tk.Label(head, text="1 z 9 — sterowanie serwerem", bg="#0d0e12", fg="#eaeaf0",
                 font=("Segoe UI", 15, "bold")).pack(side="left")
        self.status_var = tk.StringVar(value="●  Zatrzymany")
        self.status_lbl = tk.Label(head, textvariable=self.status_var, bg="#0d0e12",
                                   fg="#e05252", font=("Segoe UI", 11, "bold"))
        self.status_lbl.pack(side="right")

        # ---- Sciezki / info ----
        info = tk.Frame(self.root, bg="#1a1b23", padx=14, pady=10)
        info.pack(fill="x", padx=14, pady=(0, 8))

        node = find_node()
        node_str = node if node else "(nie znaleziono)"
        tk.Label(info, text=f"Node.js: {node_str}",  bg="#1a1b23", fg="#8b8ea0", anchor="w", font=("Segoe UI", 9)).pack(fill="x")
        tk.Label(info, text=f"Server:  {SERVER_DIR}", bg="#1a1b23", fg="#8b8ea0", anchor="w", font=("Segoe UI", 9)).pack(fill="x")
        tk.Label(info, text=f"Web dist: {WEB_DIST}",  bg="#1a1b23", fg="#8b8ea0", anchor="w", font=("Segoe UI", 9)).pack(fill="x")
        tk.Label(info, text=f"Baza:     {DB_PATH}",   bg="#1a1b23", fg="#8b8ea0", anchor="w", font=("Segoe UI", 9)).pack(fill="x")

        # ---- URL LAN + akcje ----
        url_bar = tk.Frame(self.root, bg="#0d0e12", padx=14, pady=6)
        url_bar.pack(fill="x")
        self.url = f"http://{self.lan_ip}:{self.port}"
        self.url_var = tk.StringVar(value=self.url)
        tk.Label(url_bar, text="Adres LAN:", bg="#0d0e12", fg="#eaeaf0", font=("Segoe UI", 11)).pack(side="left")
        tk.Entry(url_bar, textvariable=self.url_var, width=32, font=("Consolas", 12, "bold"),
                 bg="#23242e", fg="#3ad973", relief="flat", readonlybackground="#23242e",
                 state="readonly").pack(side="left", padx=8, ipady=4)
        tk.Button(url_bar, text="Kopiuj URL", command=self.copy_url,
                  bg="#23242e", fg="#eaeaf0", relief="flat", padx=10).pack(side="left", padx=4)
        tk.Button(url_bar, text="Otworz w przegladarce", command=self.open_browser,
                  bg="#2d6a4f", fg="white", relief="flat", padx=10).pack(side="left", padx=4)

        # ---- Start / Stop ----
        actions = tk.Frame(self.root, bg="#0d0e12", padx=14, pady=6)
        actions.pack(fill="x")
        self.start_btn = tk.Button(actions, text="▶  START serwera", command=self.start,
                                   bg="#2d6a4f", fg="white", font=("Segoe UI", 11, "bold"),
                                   relief="flat", padx=20, pady=8)
        self.start_btn.pack(side="left", padx=4)
        self.stop_btn = tk.Button(actions, text="■  STOP serwera", command=self.stop,
                                  bg="#a63d40", fg="white", font=("Segoe UI", 11, "bold"),
                                  relief="flat", padx=20, pady=8, state="disabled")
        self.stop_btn.pack(side="left", padx=4)
        self.clear_btn = tk.Button(actions, text="Wyczysc logi", command=self.clear_log,
                                   bg="#23242e", fg="#8b8ea0", relief="flat", padx=10, pady=8)
        self.clear_btn.pack(side="right", padx=4)

        # ---- Siec WiFi dla ESP ----
        self._build_wifi_ui()

        # ---- Sloty dzwiekow (9x) ----
        self._build_sounds_ui()

        # ---- Log ----
        log_frame = tk.Frame(self.root, bg="#0d0e12", padx=14, pady=8)
        log_frame.pack(fill="both", expand=True)
        tk.Label(log_frame, text="Logi backendu:", bg="#0d0e12", fg="#8b8ea0",
                 anchor="w", font=("Segoe UI", 9)).pack(fill="x")
        self.log = scrolledtext.ScrolledText(
            log_frame, bg="#0d0e12", fg="#eaeaf0",
            insertbackground="white", font=("Consolas", 9),
            relief="flat", borderwidth=1
        )
        self.log.pack(fill="both", expand=True, pady=(4, 0))
        self.log.configure(state="disabled")

    # ---------------- Sloty dzwiekow ----------------

    def _load_sound_config(self) -> dict:
        if SOUNDS_JSON.exists():
            try:
                return json.loads(SOUNDS_JSON.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {"slots": {}}

    def _save_sound_config(self, cfg: dict):
        SOUNDS_JSON.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")

    def _build_sounds_ui(self):
        wrap = tk.Frame(self.root, bg="#0d0e12", padx=14, pady=6)
        wrap.pack(fill="x")
        tk.Label(wrap, text="Sloty dzwiekow (1..9) — kliknij Wybierz, aby wskazac plik mp3/wav",
                 bg="#0d0e12", fg="#8b8ea0", anchor="w", font=("Segoe UI", 9)).pack(fill="x", pady=(4, 6))

        grid = tk.Frame(wrap, bg="#1a1b23")
        grid.pack(fill="x", padx=0)

        self.slot_vars: dict[str, tk.StringVar] = {}
        cfg = self._load_sound_config()
        slots = cfg.get("slots", {}) or {}

        for i in range(9):
            key = str(i + 1)
            row = tk.Frame(grid, bg="#1a1b23")
            row.pack(fill="x", padx=6, pady=2)

            tk.Label(row, text=key, bg="#23242e", fg="#eaeaf0",
                     font=("Segoe UI", 11, "bold"),
                     width=2, relief="flat").pack(side="left", padx=(0, 8), ipady=3)

            var = tk.StringVar(value=slots.get(key) or "")
            self.slot_vars[key] = var
            entry = tk.Entry(row, textvariable=var, bg="#23242e", fg="#eaeaf0",
                             relief="flat", font=("Consolas", 9),
                             readonlybackground="#23242e", state="readonly")
            entry.pack(side="left", fill="x", expand=True, ipady=3)

            tk.Button(row, text="Wybierz", bg="#23242e", fg="#eaeaf0",
                      relief="flat", padx=8,
                      command=lambda k=key: self._pick_slot(k)).pack(side="left", padx=4)
            tk.Button(row, text="Wyczysc", bg="#23242e", fg="#8b8ea0",
                      relief="flat", padx=8,
                      command=lambda k=key: self._clear_slot(k)).pack(side="left")

    def _pick_slot(self, key: str):
        cur = self.slot_vars[key].get() or str(APP_DIR)
        f = filedialog.askopenfilename(
            title=f"Wybierz plik dla slotu {key}",
            initialdir=str(Path(cur).parent) if cur and Path(cur).parent.exists() else str(APP_DIR),
            filetypes=AUDIO_EXTS,
        )
        if not f:
            return
        self.slot_vars[key].set(f)
        self._save_current_slots()

    def _clear_slot(self, key: str):
        self.slot_vars[key].set("")
        self._save_current_slots()

    def _save_current_slots(self):
        cfg = {"slots": {k: (v.get() or None) for k, v in self.slot_vars.items()}}
        try:
            self._save_sound_config(cfg)
            self.add_log(f"[launcher] Zapisano sloty do {SOUNDS_JSON.name}\n")
        except Exception as e:
            messagebox.showerror("Zapis slotow", str(e))

    # ---------------- Siec WiFi dla ESP ----------------

    def _load_wifi_config(self) -> dict:
        if WIFI_JSON.exists():
            try:
                return json.loads(WIFI_JSON.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {}

    def _save_wifi_config(self):
        # Hasla celowo NIE zapisujemy na dysk — tylko SSID/IP/brame dla wygody.
        cfg = {
            "ssid": self.wifi_ssid.get().strip(),
            "ip":   self.wifi_ip.get().strip(),
            "gw":   self.wifi_gw.get().strip(),
        }
        try:
            WIFI_JSON.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

    def _build_wifi_ui(self):
        wrap = tk.Frame(self.root, bg="#0d0e12", padx=14, pady=6)
        wrap.pack(fill="x")
        tk.Label(
            wrap,
            text="Siec WiFi dla ESP — gdy ESP wystawi siec „1z9-setup”: "
                 "podlacz do niej laptop, wpisz siec docelowa i wyslij",
            bg="#0d0e12", fg="#8b8ea0", anchor="w", font=("Segoe UI", 9),
        ).pack(fill="x", pady=(4, 6))

        box = tk.Frame(wrap, bg="#1a1b23", padx=10, pady=8)
        box.pack(fill="x")
        cfg = self._load_wifi_config()

        r1 = tk.Frame(box, bg="#1a1b23"); r1.pack(fill="x", pady=2)
        tk.Label(r1, text="SSID", width=8, anchor="w", bg="#1a1b23", fg="#eaeaf0",
                 font=("Segoe UI", 9)).pack(side="left")
        self.wifi_ssid = tk.StringVar(value=cfg.get("ssid", ""))
        tk.Entry(r1, textvariable=self.wifi_ssid, bg="#23242e", fg="#eaeaf0", relief="flat",
                 font=("Consolas", 10)).pack(side="left", fill="x", expand=True, ipady=3)

        r2 = tk.Frame(box, bg="#1a1b23"); r2.pack(fill="x", pady=2)
        tk.Label(r2, text="Haslo", width=8, anchor="w", bg="#1a1b23", fg="#eaeaf0",
                 font=("Segoe UI", 9)).pack(side="left")
        self.wifi_pass = tk.StringVar(value="")
        self.wifi_pass_entry = tk.Entry(r2, textvariable=self.wifi_pass, show="*", bg="#23242e",
                                        fg="#eaeaf0", relief="flat", font=("Consolas", 10))
        self.wifi_pass_entry.pack(side="left", fill="x", expand=True, ipady=3)
        self.wifi_show = tk.BooleanVar(value=False)
        tk.Checkbutton(r2, text="pokaz", variable=self.wifi_show, command=self._toggle_wifi_pass,
                       bg="#1a1b23", fg="#8b8ea0", activebackground="#1a1b23",
                       selectcolor="#23242e", relief="flat", font=("Segoe UI", 8)).pack(side="left", padx=4)

        r3 = tk.Frame(box, bg="#1a1b23"); r3.pack(fill="x", pady=2)
        tk.Label(r3, text="IP ESP", width=8, anchor="w", bg="#1a1b23", fg="#eaeaf0",
                 font=("Segoe UI", 9)).pack(side="left")
        self.wifi_ip = tk.StringVar(value=cfg.get("ip", "192.168.1.50"))
        tk.Entry(r3, textvariable=self.wifi_ip, width=16, bg="#23242e", fg="#eaeaf0", relief="flat",
                 font=("Consolas", 10)).pack(side="left", ipady=3)
        tk.Label(r3, text="Brama", anchor="e", bg="#1a1b23", fg="#eaeaf0",
                 font=("Segoe UI", 9)).pack(side="left", padx=(12, 4))
        self.wifi_gw = tk.StringVar(value=cfg.get("gw", "192.168.1.1"))
        tk.Entry(r3, textvariable=self.wifi_gw, width=16, bg="#23242e", fg="#eaeaf0", relief="flat",
                 font=("Consolas", 10)).pack(side="left", ipady=3)

        r4 = tk.Frame(box, bg="#1a1b23"); r4.pack(fill="x", pady=(6, 2))
        self.wifi_send_btn = tk.Button(r4, text="Wyslij do ESP (1z9-setup)", command=self._send_wifi,
                                       bg="#2d6a4f", fg="white", relief="flat", padx=14, pady=6,
                                       font=("Segoe UI", 10, "bold"))
        self.wifi_send_btn.pack(side="left")
        tk.Label(r4, text="najpierw podlacz laptop do WiFi „1z9-setup”",
                 bg="#1a1b23", fg="#8b8ea0", font=("Segoe UI", 8)).pack(side="left", padx=8)

    def _toggle_wifi_pass(self):
        self.wifi_pass_entry.configure(show="" if self.wifi_show.get() else "*")

    def _send_wifi(self):
        ssid = self.wifi_ssid.get().strip()
        pw   = self.wifi_pass.get()
        ip   = self.wifi_ip.get().strip()
        gw   = self.wifi_gw.get().strip()
        if not ssid or not ip or not gw:
            messagebox.showwarning("WiFi ESP", "Podaj SSID, IP i brame.")
            return
        self._save_wifi_config()
        self.wifi_send_btn.configure(state="disabled")
        self.add_log(f"[wifi] Wysylanie do ESP ({ESP_AP_URL}) ...\n")
        threading.Thread(target=self._send_wifi_worker,
                         args=(ssid, pw, ip, gw), daemon=True).start()

    def _send_wifi_worker(self, ssid, pw, ip, gw):
        data = urllib.parse.urlencode({"ssid": ssid, "pass": pw, "ip": ip, "gw": gw}).encode()
        ok, msg = False, ""
        try:
            req = urllib.request.Request(f"{ESP_AP_URL}/wifi", data=data, method="POST")
            with urllib.request.urlopen(req, timeout=6) as resp:
                resp.read()
                code = resp.getcode()
                ok = code is not None and code < 400
                msg = f"HTTP {code}"
        except Exception as e:
            msg = str(e)
        self.root.after(0, lambda: self._send_wifi_done(ok, ssid, ip, msg))

    def _send_wifi_done(self, ok, ssid, ip, msg):
        self.wifi_send_btn.configure(state="normal")
        if ok:
            self.add_log(f"[wifi] Wyslano. ESP restartuje i laczy z „{ssid}” pod http://{ip}\n")
            messagebox.showinfo(
                "WiFi ESP",
                f"Wyslano do ESP.\nESP zrestartuje sie i polaczy z siecia „{ssid}”.\n\n"
                f"Teraz przelacz laptop z powrotem na siec „{ssid}”.\n"
                f"ESP bedzie dostepny pod http://{ip}",
            )
        else:
            self.add_log(f"[wifi] Blad wysylki: {msg}\n")
            messagebox.showerror(
                "WiFi ESP",
                f"Nie udalo sie wyslac do ESP ({ESP_AP_URL}).\n\n{msg}\n\n"
                f"Czy laptop jest podlaczony do sieci „1z9-setup”?",
            )

    # ---------------- Log queue ----------------

    def _pump_log(self):
        try:
            while True:
                line = self.log_q.get_nowait()
                self.log.configure(state="normal")
                self.log.insert("end", line)
                self.log.see("end")
                self.log.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(80, self._pump_log)

    def add_log(self, msg: str):
        self.log_q.put(msg)

    def clear_log(self):
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")

    # ---------------- Actions ----------------

    def start(self):
        if self.proc:
            return
        node = find_node()
        if not node:
            messagebox.showerror(
                "Brak Node.js",
                "Nie znaleziono Node.js. Zainstaluj go z nodejs.org, "
                "albo umiesc portable node.exe w podfolderze 'node' obok launchera."
            )
            return
        if not (SERVER_DIR / "index.js").exists():
            messagebox.showerror("Blad", f"Nie znaleziono {SERVER_DIR / 'index.js'}")
            return

        env = os.environ.copy()
        env["PORT"] = str(self.port)
        env["DB_PATH"] = str(DB_PATH)
        env["WEB_DIST"] = str(WEB_DIST)
        env["SOUNDS_CONFIG"] = str(SOUNDS_JSON)

        args = [node, "--experimental-sqlite", "--env-file-if-exists=.env", "index.js"]

        try:
            self.proc = subprocess.Popen(
                args,
                cwd=str(SERVER_DIR),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        except Exception as e:
            messagebox.showerror("Blad startu", str(e))
            self.proc = None
            return

        self.status_var.set("●  Uruchomiony")
        self.status_lbl.configure(fg="#3ad973")
        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.add_log(f"[launcher] Start: {self.url}\n")

        threading.Thread(target=self._read_output, daemon=True).start()

    def _read_output(self):
        assert self.proc and self.proc.stdout
        try:
            for line in self.proc.stdout:
                self.add_log(line)
        except Exception:
            pass
        self.add_log("[launcher] Backend zakonczyl prace.\n")
        self.root.after(0, self._on_stop)

    def _on_stop(self):
        self.status_var.set("●  Zatrzymany")
        self.status_lbl.configure(fg="#e05252")
        self.start_btn.configure(state="normal")
        self.stop_btn.configure(state="disabled")
        self.proc = None

    def stop(self):
        if not self.proc:
            return
        self.add_log("[launcher] Zatrzymywanie...\n")
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                self.proc.kill()
            except Exception:
                pass
        except Exception:
            pass

    def open_browser(self):
        webbrowser.open(self.url)

    def copy_url(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.url)
        self.add_log(f"[launcher] Skopiowano do schowka: {self.url}\n")

    def on_close(self):
        if self.proc:
            self.stop()
        self.root.destroy()


def main():
    root = tk.Tk()
    app = App(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
