import Database from 'better-sqlite3'

export function openDb(path) {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at       INTEGER NOT NULL,
      games_played     INTEGER NOT NULL DEFAULT 0,
      wins             INTEGER NOT NULL DEFAULT 0,   -- razy 1. w rundzie 2
      best_reaction_ms INTEGER
    );

    -- Aktualne przypisanie graczy do 9 siedzen (runda 1)
    CREATE TABLE IF NOT EXISTS seats (
      seat    INTEGER PRIMARY KEY CHECK (seat >= 0 AND seat < 9),
      user_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Aktualne przypisanie graczy do 3 przyciskow rundy 2
    CREATE TABLE IF NOT EXISTS buttons (
      button  INTEGER PRIMARY KEY CHECK (button >= 0 AND button < 3),
      user_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Wyniki rund 2 (historia)
    CREATE TABLE IF NOT EXISTS round2_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      button_id   INTEGER NOT NULL,
      reaction_ms INTEGER NOT NULL,
      position    INTEGER NOT NULL,  -- 1, 2, 3
      ts          INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Bank pytan (opcjonalne, ale wygodne do przygotowania w prod)
    CREATE TABLE IF NOT EXISTS questions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      text       TEXT NOT NULL,
      answer     TEXT,
      round      INTEGER NOT NULL DEFAULT 1 CHECK (round IN (1, 2)),
      used       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- Aktualnie wyswietlane pytanie (jeden wiersz o id=1).
    -- question_id moze wskazywac do banku albo byc NULL (pytanie doraznie wpisane recznie).
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

    -- Zapewnij po 9 pustych siedzen i 3 pustych przyciskow (idempotentnie)
    INSERT OR IGNORE INTO seats (seat, user_id) VALUES (0,NULL),(1,NULL),(2,NULL),(3,NULL),(4,NULL),(5,NULL),(6,NULL),(7,NULL),(8,NULL);
    INSERT OR IGNORE INTO buttons (button, user_id) VALUES (0,NULL),(1,NULL),(2,NULL);
    INSERT OR IGNORE INTO current_question (id, question_id, text, answer, round, show_answer, updated_at)
      VALUES (1, NULL, NULL, NULL, 1, 0, 0);
  `)

  // Migracja: dodaj kolumne lives do seats jesli nie istnieje.
  // ALTER TABLE ADD COLUMN nie ma "IF NOT EXISTS" w SQLite - try/catch.
  try { db.exec(`ALTER TABLE seats ADD COLUMN lives INTEGER NOT NULL DEFAULT 3`) } catch {}

  return db
}
