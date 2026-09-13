CREATE TABLE IF NOT EXISTS fridge_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit TEXT DEFAULT '',
  category TEXT DEFAULT 'other',
  added_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  used_up INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS groceries_bought (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit TEXT DEFAULT '',
  bought_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cravings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT UNIQUE NOT NULL,
  label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL,
  day_date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  is_leftover INTEGER DEFAULT 0,
  leftover_of_meal_id INTEGER,
  price REAL,
  protein TEXT,
  needs_defrost INTEGER DEFAULT 0,
  ingredients_json TEXT DEFAULT '[]',
  recipe TEXT DEFAULT '',
  prep_minutes INTEGER,
  cook_minutes INTEGER,
  difficulty TEXT DEFAULT '',
  defrost_notified INTEGER DEFAULT 0,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);

-- Single-row table (id = 1) holding the user's personalization settings.
CREATE TABLE IF NOT EXISTS preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lifestyle TEXT DEFAULT '',
  max_price_per_serving REAL,
  cooking_experience TEXT DEFAULT 'intermediate',
  max_total_minutes INTEGER,
  currency_code TEXT DEFAULT 'USD',
  currency_symbol TEXT DEFAULT '$',
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO preferences (id) VALUES (1);

CREATE TABLE IF NOT EXISTS grocery_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  category TEXT DEFAULT 'other',
  package_size TEXT DEFAULT '',
  price REAL,
  checked INTEGER DEFAULT 0,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);

CREATE INDEX IF NOT EXISTS idx_meals_week ON meals(week_id);
CREATE INDEX IF NOT EXISTS idx_meals_day ON meals(day_date);
CREATE INDEX IF NOT EXISTS idx_grocery_week ON grocery_list_items(week_id);
