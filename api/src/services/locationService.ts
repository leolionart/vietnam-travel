import { getDb } from '../db/connection.js';
import { updatePlanDateRange } from './planService.js';

interface DbLocation {
    id: number;
    plan_id: number;
    sort_order: number;
    arrive_at: number | null;
    depart_at: number | null;
    duration_days: number;
}

export interface CreateLocationInput {
    name: string;
    province?: string;
    lat?: number;
    lng?: number;
    arriveAt?: number | null;
    departAt?: number | null;
    durationDays?: number;
    transportType?: string;
    transportLabel?: string;
    highlight?: string;
    description?: string;
    activities?: string[];
    food?: string[];
}

export function addLocation(planId: number, input: CreateLocationInput): number {
    const db = getDb();

    const maxOrder = (db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) as m FROM locations WHERE plan_id = ?'
    ).get(planId) as { m: number }).m;

    const result = db.prepare(`
        INSERT INTO locations (
            plan_id, sort_order, name, province, lat, lng,
            arrive_at, depart_at, duration_days,
            transport_type, transport_label, transport_fare,
            transport_fare_adult, transport_fare_child,
            accommodation_name, accommodation_url, accommodation_address,
            adult_price, child_price, stay_cost_per_night, food_budget_per_day,
            adults, children, highlight, description, activities, food
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        planId,
        maxOrder + 1,
        input.name,
        input.province ?? '',
        input.lat ?? 0,
        input.lng ?? 0,
        input.arriveAt ?? null,
        input.departAt ?? null,
        input.durationDays ?? 0,
        input.transportType ?? 'car',
        input.transportLabel ?? '',
        0,
        0,
        0,
        '',
        '',
        '',
        0,
        0,
        0,
        0,
        0,
        0,
        input.highlight ?? '',
        input.description ?? '',
        JSON.stringify(input.activities ?? []),
        JSON.stringify(input.food ?? [])
    );

    updatePlanDateRange(planId);
    return result.lastInsertRowid as number;
}

export function updateLocation(
    planId: number,
    locationId: number,
    input: Partial<CreateLocationInput>
): boolean {
    const db = getDb();
    const loc = db.prepare('SELECT * FROM locations WHERE id = ? AND plan_id = ?').get(locationId, planId) as DbLocation | undefined;
    if (!loc) return false;

    const fields: string[] = [];
    const values: unknown[] = [];
    const map: Record<string, unknown> = {
        name: input.name,
        province: input.province,
        lat: input.lat,
        lng: input.lng,
        arrive_at: input.arriveAt,
        depart_at: input.departAt,
        duration_days: input.durationDays,
        transport_type: input.transportType,
        transport_label: input.transportLabel,
        highlight: input.highlight,
        description: input.description,
        activities: input.activities !== undefined ? JSON.stringify(input.activities) : undefined,
        food: input.food !== undefined ? JSON.stringify(input.food) : undefined,
    };

    for (const [k, v] of Object.entries(map)) {
        if (v !== undefined) {
            fields.push(`${k} = ?`);
            values.push(v);
        }
    }

    if (!fields.length) return true;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(locationId);

    db.prepare(`UPDATE locations SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    if (input.arriveAt !== undefined || input.departAt !== undefined || input.durationDays !== undefined) {
        updatePlanDateRange(planId);
    }

    return true;
}

export function deleteLocation(planId: number, locationId: number): boolean {
    const db = getDb();
    const loc = db.prepare('SELECT * FROM locations WHERE id = ? AND plan_id = ?').get(locationId, planId) as DbLocation | undefined;
    if (!loc) return false;

    db.prepare('DELETE FROM locations WHERE id = ?').run(locationId);

    updatePlanDateRange(planId);

    return true;
}

export function reorderLocations(planId: number, orderedIds: number[]): void {
    const db = getDb();
    const update = db.prepare(
        'UPDATE locations SET sort_order = ?, updated_at = ? WHERE id = ? AND plan_id = ?'
    );
    const now = Date.now();
    const reorder = db.transaction(() => {
        orderedIds.forEach((id, idx) => {
            update.run(idx, now, id, planId);
        });
    });
    reorder();
}
