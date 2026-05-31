PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    date_range TEXT    NOT NULL DEFAULT '',
    session_id TEXT    UNIQUE,
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
    duration_days    REAL    NOT NULL DEFAULT 0,
    scheduled_date   TEXT    NOT NULL DEFAULT '',
    scheduled_period TEXT    NOT NULL DEFAULT '',
    scheduled_time   TEXT    NOT NULL DEFAULT '',
    description      TEXT    NOT NULL DEFAULT '',
    activity_type    TEXT    NOT NULL DEFAULT 'sightseeing',
    transport_type   TEXT    NOT NULL DEFAULT '',
    pricing_mode     TEXT    NOT NULL DEFAULT 'per_person',
    unit_price       INTEGER NOT NULL DEFAULT 0,
    quantity         REAL    NOT NULL DEFAULT 1,
    surcharge        INTEGER NOT NULL DEFAULT 0,
    adult_price      INTEGER NOT NULL DEFAULT 0,
    child_price      INTEGER NOT NULL DEFAULT 0,
    participant_adults INTEGER,
    participant_children INTEGER,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id         TEXT    PRIMARY KEY,
    plan_slug  TEXT    NOT NULL,
    custom     TEXT    NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
