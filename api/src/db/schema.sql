PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    date_range TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE TABLE IF NOT EXISTS locations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id             INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    sort_order          REAL    NOT NULL DEFAULT 0,
    name                TEXT    NOT NULL,
    province            TEXT    NOT NULL DEFAULT '',
    lat                 REAL    NOT NULL DEFAULT 0,
    lng                 REAL    NOT NULL DEFAULT 0,
    arrive_at           INTEGER,
    depart_at           INTEGER,
    duration_days       INTEGER NOT NULL DEFAULT 0,
    transport_type      TEXT    NOT NULL DEFAULT 'car',
    transport_label     TEXT    NOT NULL DEFAULT '',
    transport_fare      INTEGER NOT NULL DEFAULT 0,
    accommodation_name  TEXT    NOT NULL DEFAULT '',
    accommodation_url   TEXT    NOT NULL DEFAULT '',
    adult_price         INTEGER NOT NULL DEFAULT 0,
    child_price         INTEGER NOT NULL DEFAULT 0,
    stay_cost_per_night INTEGER NOT NULL DEFAULT 0,
    food_budget_per_day INTEGER NOT NULL DEFAULT 0,
    adults              INTEGER NOT NULL DEFAULT 2,
    children            INTEGER NOT NULL DEFAULT 0,
    highlight           TEXT    NOT NULL DEFAULT '',
    description         TEXT    NOT NULL DEFAULT '',
    activities          TEXT    NOT NULL DEFAULT '[]',
    food                TEXT    NOT NULL DEFAULT '[]',
    created_at          INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE TABLE IF NOT EXISTS sub_locations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id      INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    sort_order       REAL    NOT NULL DEFAULT 0,
    name             TEXT    NOT NULL,
    lat              REAL    NOT NULL DEFAULT 0,
    lng              REAL    NOT NULL DEFAULT 0,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    description      TEXT    NOT NULL DEFAULT '',
    adult_price      INTEGER NOT NULL DEFAULT 0,
    child_price      INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
