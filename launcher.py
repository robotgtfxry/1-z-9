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

import os
import queue
import shutil
import socket
import subprocess
import sys
import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import messagebox, scrolledtext

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
DEFAULT_PORT = 4000

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
        self.root.geometry("900x640")
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
