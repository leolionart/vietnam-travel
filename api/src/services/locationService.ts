import { getDb } from '../db/connection.js';
import { cascadeDates, type CascadableLocation } from './dateService.js';
import { updatePlanDateRange } from './planService.js';

interface DbLocation {
    id: number;
    plan_id: number;
    sort_order: number;
    arrive_at: number | null;
    depart_at: number | null;
    duration_days: number;
}

function getCascadableLocations(planId: number): CascadableLocation[] {
    const db = getDb();
    return db.prepare(
        'SELECT id, arrive_at, depart_at, duration_days FROM locations WHERE plan_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(planId) as CascadableLocation[];
}

function applyCascade(planId: number, startIndex: number): void {
    const db = getDb();
    const locs = getCascadableLocations(planId);
    const cascaded = cascadeDates(locs, startIndex);

    const update = db.prepare(
        'UPDATE locations SET arrive_at = ?, depart_at = ?, updated_at = ? WHERE id = ?'
    );
    const now = Date.now();
    for (let i = startIndex; i < cascaded.length; i++) {
        update.run(cascaded[i].arrive_at, cascaded[i].depart_at, now, cascaded[i].id);
    }

    updatePlanDateRange(planId);
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
    transportFare?: number;
    transportFareAdult?: number;
    transportFareChild?: number;
    accommodationName?: string;
    accommodationUrl?: string;
    accommodationAddress?: string;
    adultPrice?: number;
    childPrice?: number;
    stayCostPerNight?: number;
    foodBudgetPerDay?: number;
    adults?: number;
    children?: number;
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
        input.transportFare ?? 0,
        input.transportFareAdult ?? 0,
        input.transportFareChild ?? 0,
        input.accommodationName ?? '',
        input.accommodationUrl ?? '',
        input.accommodationAddress ?? '',
        input.adultPrice ?? 0,
        input.childPrice ?? 0,
        input.stayCostPerNight ?? 0,
        input.foodBudgetPerDay ?? 0,
        input.adults ?? 2,
        input.children ?? 0,
        input.highlight ?? '',
        input.description ?? '',
        JSON.stringify(input.activities ?? []),
        JSON.stringify(input.food ?? [])
    );

    const newId = result.lastInsertRowid as number;

    // If arrive_at was given, cascade from this location
    const locs = getCascadableLocations(planId);
    const idx = locs.findIndex(l => l.id === newId);
    if (idx >= 0) applyCascade(planId, idx);

    return newId;
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
        transport_fare: input.transportFare,
        transport_fare_adult: input.transportFareAdult,
        transport_fare_child: input.transportFareChild,
        accommodation_name: input.accommodationName,
        accommodation_url: input.accommodationUrl,
        accommodation_address: input.accommodationAddress,
        adult_price: input.adultPrice,
        child_price: input.childPrice,
        stay_cost_per_night: input.stayCostPerNight,
        food_budget_per_day: input.foodBudgetPerDay,
        adults: input.adults,
        children: input.children,
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

    // Cascade dates if duration or arrive_at changed
    const locs = getCascadableLocations(planId);
    const idx = locs.findIndex(l => l.id === locationId);
    if (idx >= 0) applyCascade(planId, idx);

    return true;
}

export function deleteLocation(planId: number, locationId: number): boolean {
    const db = getDb();
    const loc = db.prepare('SELECT * FROM locations WHERE id = ? AND plan_id = ?').get(locationId, planId) as DbLocation | undefined;
    if (!loc) return false;

    db.prepare('DELETE FROM locations WHERE id = ?').run(locationId);

    // Re-cascade from the position of the deleted location
    const locs = getCascadableLocations(planId);
    const idx = Math.min(loc.sort_order, locs.length - 1);
    if (idx >= 0 && locs.length > 0) applyCascade(planId, idx);
    else updatePlanDateRange(planId);

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
    applyCascade(planId, 0);
}
