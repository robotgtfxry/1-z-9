import { DatabaseSync } from 'node:sqlite'

export function openDb(path) {
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode = WAL`)
  db.exec(`PRAGMA foreign_keys = ON`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at       INTEGER NOT NULL,
      games_played     INTEGER NOT NULL DEFAULT 0,
      wins             INTEGER NOT NULL DEFAULT 0,   -- razy 1. w rundzie 2
      best_reaction_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS seats (
      seat    INTEGER PRIMARY KEY CHECK (seat >= 0 AND seat < 9),
      user_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS buttons (
      button  INTEGER PRIMARY KEY CHECK (button >= 0 AND button < 3),
      user_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS round2_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      button_id   INTEGER NOT NULL,
      reaction_ms INTEGER NOT NULL,
      position    INTEGER NOT NULL,
      ts          INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      text       TEXT NOT NULL,
      answer     TEXT,
      round      INTEGER NOT NULL DEFAULT 1 CHECK (round IN (1, 2)),
      used       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS current_question (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      question_id  INTEGER,
      text         TEXT,
      answer       TEXT,
      round        INTEGER NOT NULL DEFAULT 1 CHECK (round IN (1, 2)),
      show_answer  INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL
    );

    INSERT OR IGNORE INTO seats (seat, user_id) VALUES (0,NULL),(1,NULL),(2,NULL),(3,NULL),(4,NULL),(5,NULL),(6,NULL),(7,NULL),(8,NULL);
    INSERT OR IGNORE INTO buttons (button, user_id) VALUES (0,NULL),(1,NULL),(2,NULL);
    INSERT OR IGNORE INTO current_question (id, question_id, text, answer, round, show_answer, updated_at)
      VALUES (1, NULL, NULL, NULL, 1, 0, 0);
  `)

  // Migracja: kolumna lives dla seats (jesli baza z poprzedniej wersji)
  try { db.exec(`ALTER TABLE seats ADD COLUMN lives INTEGER NOT NULL DEFAULT 3`) } catch {}
  // Migracja: kolor per stanowisko
  try { db.exec(`ALTER TABLE seats ADD COLUMN color TEXT NOT NULL DEFAULT '#e05252'`) } catch {}
  // Migracja: punkty w rundzie 2 (0..3, sterowane zbieraniem punktow, rosna w gore)
  try { db.exec(`ALTER TABLE seats ADD COLUMN points INTEGER NOT NULL DEFAULT 0`) } catch {}
  // Migracja: powiazanie wyniku R2 z pytaniem
  try { db.exec(`ALTER TABLE round2_results ADD COLUMN question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL`) } catch {}
  // Migracja: kolejnosc pytan w banku
  try { db.exec(`ALTER TABLE questions ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`) } catch {}

  return db
}
