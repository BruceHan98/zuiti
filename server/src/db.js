import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { DATA_DIR, DB_FILE } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  mbti         TEXT NOT NULL DEFAULT '',
  content_enc  TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  llm_enc  TEXT NOT NULL DEFAULT ''
);
`);

// 轻量迁移：老库补 mbti 列（幂等）
try {
  db.prepare("ALTER TABLE chat_sessions ADD COLUMN mbti TEXT NOT NULL DEFAULT ''").run();
} catch (e) {
  if (!/duplicate column/i.test(String(e.message))) throw e;
}

export function nowTs() {
  return Date.now();
}
