import { getDb } from './connection.js';

export function runMigration(): void {
    const db = getDb();

    const addColumns = [
        'ALTER TABLE locations ADD COLUMN transport_fare_adult INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE locations ADD COLUMN transport_fare_child INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE locations ADD COLUMN accommodation_address TEXT NOT NULL DEFAULT \'\'',
        'ALTER TABLE plans ADD COLUMN session_id TEXT',
        'ALTER TABLE sub_locations ADD COLUMN scheduled_date TEXT NOT NULL DEFAULT \'\'',
        'ALTER TABLE sub_locations ADD COLUMN scheduled_period TEXT NOT NULL DEFAULT \'\'',
        'ALTER TABLE sub_locations ADD COLUMN duration_days REAL NOT NULL DEFAULT 0',
        'ALTER TABLE sub_locations ADD COLUMN activity_type TEXT NOT NULL DEFAULT \'sightseeing\'',
        'ALTER TABLE sub_locations ADD COLUMN transport_type TEXT NOT NULL DEFAULT \'\'',
        'ALTER TABLE sub_locations ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT \'per_person\'',
        'ALTER TABLE sub_locations ADD COLUMN unit_price INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE sub_locations ADD COLUMN quantity REAL NOT NULL DEFAULT 1',
        'ALTER TABLE sub_locations ADD COLUMN surcharge INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE sub_locations ADD COLUMN participant_adults INTEGER',
        'ALTER TABLE sub_locations ADD COLUMN participant_children INTEGER',
    ];

    for (const sql of addColumns) {
        try {
            db.prepare(sql).run();
        } catch {
            // Column already exists.
        }
    }

    console.log('[migrate] Schema migration completed. Data is environment-local and is not seeded or reset by deploy.');
}
