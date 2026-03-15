import { getDb } from '../db/connection.js';
import { formatDateRange, computePlanDateRange, type CascadableLocation } from './dateService.js';
import { buildVexereUrl } from '../lib/vexere.js';

interface DbSubLocation {
    id: number;
    location_id: number;
    sort_order: number;
    name: string;
    lat: number;
    lng: number;
    duration_minutes: number;
    description: string;
    adult_price: number;
    child_price: number;
}

interface DbLocation {
    id: number;
    plan_id: number;
    sort_order: number;
    name: string;
    province: string;
    lat: number;
    lng: number;
    arrive_at: number | null;
    depart_at: number | null;
    duration_days: number;
    transport_type: string;
    transport_label: string;
    transport_fare: number;
    transport_fare_adult: number;
    transport_fare_child: number;
    accommodation_name: string;
    accommodation_url: string;
    accommodation_address: string;
    adult_price: number;
    child_price: number;
    stay_cost_per_night: number;
    food_budget_per_day: number;
    adults: number;
    children: number;
    highlight: string;
    description: string;
    activities: string;
    food: string;
}

interface DbPlan {
    id: number;
    slug: string;
    name: string;
    date_range: string;
    created_at: number;
    updated_at: number;
}

function subToPublic(sub: DbSubLocation) {
    return {
        id: sub.id,
        name: sub.name,
        lat: sub.lat,
        lng: sub.lng,
        durationMinutes: sub.duration_minutes,
        description: sub.description,
        adultPrice: sub.adult_price,
        childPrice: sub.child_price,
    };
}

function locationToPublic(loc: DbLocation, prevProvince?: string) {
    const db = getDb();
    const subs = db.prepare(
        'SELECT * FROM sub_locations WHERE location_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(loc.id) as DbSubLocation[];

    const dateRange = formatDateRange(loc.arrive_at, loc.depart_at);
    const vexereUrl = prevProvince
        ? buildVexereUrl({
            fromProvince: prevProvince,
            toProvince: loc.province,
            travelDate: loc.arrive_at
                ? new Date(loc.arrive_at).toLocaleDateString('vi-VN')
                : '',
        })
        : null;

    return {
        id: loc.id,
        name: loc.name,
        province: loc.province,
        lat: loc.lat,
        lng: loc.lng,
        dateRange,
        duration: loc.duration_days,
        transport: loc.transport_label,
        transportType: loc.transport_type,
        transportFare: loc.transport_fare,
        transportFareAdult: loc.transport_fare_adult,
        transportFareChild: loc.transport_fare_child,
        accommodationName: loc.accommodation_name,
        accommodationUrl: loc.accommodation_url,
        accommodationAddress: loc.accommodation_address,
        adultPrice: loc.adult_price,
        childPrice: loc.child_price,
        stayCostPerNight: loc.stay_cost_per_night,
        foodBudgetPerDay: loc.food_budget_per_day,
        adults: loc.adults,
        children: loc.children,
        highlight: loc.highlight,
        description: loc.description,
        activities: JSON.parse(loc.activities || '[]') as string[],
        food: JSON.parse(loc.food || '[]') as string[],
        vexereUrl,
        subLocations: subs.map(subToPublic),
    };
}

export function listPlans() {
    const db = getDb();
    const plans = db.prepare('SELECT * FROM plans ORDER BY id ASC').all() as DbPlan[];
    return plans.map(p => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        dateRange: p.date_range,
    }));
}

export function getPlanBySlug(slug: string) {
    const db = getDb();
    const plan = db.prepare('SELECT * FROM plans WHERE slug = ?').get(slug) as DbPlan | undefined;
    if (!plan) return null;

    const locs = db.prepare(
        'SELECT * FROM locations WHERE plan_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(plan.id) as DbLocation[];

    const locations = locs.map((loc, idx) => {
        const prev = idx > 0 ? locs[idx - 1] : null;
        return locationToPublic(loc, prev?.province);
    });

    return {
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        dateRange: plan.date_range,
        locations,
    };
}

export function createPlan(data: { slug: string; name: string; dateRange?: string }) {
    const db = getDb();
    const result = db.prepare(
        'INSERT INTO plans (slug, name, date_range) VALUES (?, ?, ?)'
    ).run(data.slug, data.name, data.dateRange || '');
    return getPlanBySlug(data.slug)!;
}

export function updatePlan(slug: string, data: { name?: string; slug?: string }) {
    const db = getDb();
    const plan = db.prepare('SELECT * FROM plans WHERE slug = ?').get(slug) as DbPlan | undefined;
    if (!plan) return null;

    if (data.name !== undefined) {
        db.prepare('UPDATE plans SET name = ?, updated_at = ? WHERE id = ?')
            .run(data.name, Date.now(), plan.id);
    }
    if (data.slug !== undefined && data.slug !== slug) {
        db.prepare('UPDATE plans SET slug = ?, updated_at = ? WHERE id = ?')
            .run(data.slug, Date.now(), plan.id);
    }

    const newSlug = data.slug ?? slug;
    return getPlanBySlug(newSlug);
}

export function deletePlan(slug: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM plans WHERE slug = ?').run(slug);
    return result.changes > 0;
}

export function updatePlanDateRange(planId: number): void {
    const db = getDb();
    const locs = db.prepare(
        'SELECT arrive_at, depart_at, duration_days FROM locations WHERE plan_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(planId) as CascadableLocation[];

    const dateRange = computePlanDateRange(locs);
    db.prepare('UPDATE plans SET date_range = ?, updated_at = ? WHERE id = ?')
        .run(dateRange, Date.now(), planId);
}
