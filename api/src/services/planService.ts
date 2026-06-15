import { getDb } from '../db/connection.js';
import { formatDateRange, computePlanDateRange, type CascadableLocation } from './dateService.js';
import { buildVexereUrl } from '../lib/vexere.js';

interface DbSubLocation {
    id: number;
    location_id: number;
    sort_order: number;
    name: string;
    address: string;
    external_url: string;
    external_label: string;
    lat: number;
    lng: number;
    duration_minutes: number;
    duration_days: number;
    scheduled_date: string;
    scheduled_period: string;
    scheduled_time: string;
    description: string;
    activity_type: string;
    transport_type: string;
    pricing_mode: string;
    unit_price: number;
    quantity: number;
    surcharge: number;
    adult_price: number;
    child_price: number;
    participant_adults: number | null;
    participant_children: number | null;
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
}

interface DbPlan {
    id: number;
    slug: string;
    name: string;
    date_range: string;
    budget_limit: number;
    session_id: string | null;
    created_at: number;
    updated_at: number;
}

interface PlanWriteInput {
    slug: string;
    name: string;
    dateRange?: string;
    budgetLimit?: number;
}

function normalizeBudgetLimit(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const budget = Number(value);
    if (!Number.isFinite(budget) || budget <= 0) return undefined;
    return Math.round(budget);
}

function planSummaryToPublic(plan: DbPlan) {
    return {
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        dateRange: plan.date_range,
        budgetLimit: plan.budget_limit,
    };
}

function subToPublic(sub: DbSubLocation) {
    return {
        id: sub.id,
        name: sub.name,
        address: sub.address || '',
        externalUrl: sub.external_url || '',
        externalLabel: sub.external_label || '',
        lat: sub.lat,
        lng: sub.lng,
        durationMinutes: sub.duration_minutes,
        durationDays: sub.duration_days || 0,
        scheduledDate: sub.scheduled_date,
        scheduledPeriod: sub.scheduled_period,
        scheduledTime: sub.scheduled_time || '',
        description: sub.description,
        activityType: sub.activity_type || 'sightseeing',
        transportType: sub.transport_type || '',
        pricingMode: sub.pricing_mode || 'per_person',
        unitPrice: sub.unit_price || 0,
        quantity: sub.quantity ?? 1,
        surcharge: sub.surcharge || 0,
        adultPrice: sub.adult_price,
        childPrice: sub.child_price,
        participantAdults: sub.participant_adults,
        participantChildren: sub.participant_children,
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
        vexereUrl,
        subLocations: subs.map(subToPublic),
    };
}

export function listPlans() {
    const db = getDb();
    const plans = db.prepare('SELECT * FROM plans WHERE session_id IS NULL ORDER BY id ASC').all() as DbPlan[];
    return plans.map(planSummaryToPublic);
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
        budgetLimit: plan.budget_limit,
        sessionId: plan.session_id,
        locations,
    };
}

export function createPlan(data: PlanWriteInput) {
    const db = getDb();
    const budgetLimit = normalizeBudgetLimit(data.budgetLimit);
    const result = db.prepare(
        'INSERT INTO plans (slug, name, date_range, budget_limit) VALUES (?, ?, ?, ?)'
    ).run(data.slug, data.name, data.dateRange || '', budgetLimit ?? 150000000);
    return getPlanBySlug(data.slug)!;
}

export function createSessionPlan(data: PlanWriteInput & { sessionId: string }) {
    const db = getDb();
    const budgetLimit = normalizeBudgetLimit(data.budgetLimit);
    db.prepare(
        'INSERT INTO plans (slug, name, date_range, budget_limit, session_id) VALUES (?, ?, ?, ?, ?)'
    ).run(data.slug, data.name, data.dateRange || '', budgetLimit ?? 150000000, data.sessionId);
    return getPlanBySessionId(data.sessionId)!;
}

function slugify(input: string): string {
    const slug = input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return slug || 'trip';
}

export function createPublicSessionPlan(data: { slug?: string; name: string; dateRange?: string; budgetLimit?: number; sessionId: string }) {
    const db = getDb();
    const baseSlug = slugify(data.slug || data.name);
    let slug = baseSlug;
    let i = 1;
    while (db.prepare('SELECT id FROM plans WHERE slug = ?').get(slug)) {
        const suffix = i === 1 ? data.sessionId.slice(0, 6) : `${data.sessionId.slice(0, 6)}-${i}`;
        slug = `${baseSlug}-${suffix}`.slice(0, 96);
        i += 1;
    }
    return createSessionPlan({ slug, name: data.name, dateRange: data.dateRange, budgetLimit: data.budgetLimit, sessionId: data.sessionId });
}

export function getPlanBySessionId(sessionId: string) {
    const db = getDb();
    const plan = db.prepare('SELECT * FROM plans WHERE session_id = ?').get(sessionId) as DbPlan | undefined;
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
        budgetLimit: plan.budget_limit,
        sessionId: plan.session_id,
        locations,
    };
}

export function updatePlan(slug: string, data: { name?: string; slug?: string; dateRange?: string; budgetLimit?: number }) {
    const db = getDb();
    const plan = db.prepare('SELECT * FROM plans WHERE slug = ?').get(slug) as DbPlan | undefined;
    if (!plan) return null;
    const budgetLimit = normalizeBudgetLimit(data.budgetLimit);

    if (data.name !== undefined) {
        db.prepare('UPDATE plans SET name = ?, updated_at = ? WHERE id = ?')
            .run(data.name, Date.now(), plan.id);
    }
    if (data.slug !== undefined && data.slug !== slug) {
        db.prepare('UPDATE plans SET slug = ?, updated_at = ? WHERE id = ?')
            .run(data.slug, Date.now(), plan.id);
    }
    if (data.dateRange !== undefined) {
        db.prepare('UPDATE plans SET date_range = ?, updated_at = ? WHERE id = ?')
            .run(data.dateRange, Date.now(), plan.id);
    }
    if (data.budgetLimit !== undefined) {
        if (budgetLimit === undefined) return null;
        db.prepare('UPDATE plans SET budget_limit = ?, updated_at = ? WHERE id = ?')
            .run(budgetLimit, Date.now(), plan.id);
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
