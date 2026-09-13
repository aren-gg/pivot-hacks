const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Lightweight migration: add columns to an existing `meals` table created
// before these fields existed. CREATE TABLE IF NOT EXISTS won't alter columns,
// so we add any missing ones idempotently.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('meals', 'prep_minutes', 'INTEGER');
ensureColumn('meals', 'cook_minutes', 'INTEGER');
ensureColumn('meals', 'difficulty', "TEXT DEFAULT ''");

module.exports = db;
