import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const dbPath = join(dataDir, 'route-flow.db')
const db = new Database(dbPath)

// Pragmas for reliability + performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// --- Schema (idempotent migration) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lat        REAL    NOT NULL,
    lng        REAL    NOT NULL,
    road_name  TEXT,
    status     TEXT    NOT NULL CHECK (status IN ('blocked','slow','clear')),
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
  CREATE INDEX IF NOT EXISTS idx_reports_latlng  ON reports(lat, lng);

  CREATE TABLE IF NOT EXISTS report_votes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote       TEXT    NOT NULL CHECK (vote IN ('confirm','dispute')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (report_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT    NOT NULL UNIQUE,
    expires_at   TEXT    NOT NULL,
    used_at      TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reset_tokens_lookup
    ON password_reset_tokens(token_hash, expires_at);

  CREATE TABLE IF NOT EXISTS telemetry_samples (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    lat           REAL    NOT NULL,
    lng           REAL    NOT NULL,
    speed_kph     REAL    NOT NULL,
    accuracy_m    REAL,
    heading_deg   REAL,
    recorded_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_telemetry_recorded
    ON telemetry_samples(recorded_at);
  CREATE INDEX IF NOT EXISTS idx_telemetry_latlng
    ON telemetry_samples(lat, lng);
`)

export default db
