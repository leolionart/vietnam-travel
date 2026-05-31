import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/connection.js';

const router = Router();

router.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-password');
    next();
});

router.options('*', (_req, res) => {
    res.sendStatus(204);
});

type ActivityInput = {
    planSlug?: string;
    locationId?: number;
    locationName?: string;
    name?: string;
    lat?: number;
    lng?: number;
    durationMinutes?: number;
    durationDays?: number;
    scheduledDate?: string;
    scheduledPeriod?: string;
    scheduledTime?: string;
    description?: string;
    sortOrder?: number;
    activityType?: string;
    transportType?: string;
    pricingMode?: string;
    unitPrice?: number;
    quantity?: number;
    surcharge?: number;
    adultPrice?: number;
    childPrice?: number;
    participantAdults?: number | null;
    participantChildren?: number | null;
};

function getPlanIdBySlug(slug: string): number | null {
    const plan = getDb().prepare('SELECT id FROM plans WHERE slug = ?').get(slug) as { id: number } | undefined;
    return plan?.id ?? null;
}

function getLocationId(planId: number, input: ActivityInput): number | null {
    if (typeof input.locationId === 'number') {
        const row = getDb().prepare('SELECT id FROM locations WHERE id = ? AND plan_id = ?').get(input.locationId, planId) as { id: number } | undefined;
        return row?.id ?? null;
    }
    if (input.locationName) {
        const row = getDb().prepare('SELECT id FROM locations WHERE name = ? AND plan_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1').get(input.locationName, planId) as { id: number } | undefined;
        return row?.id ?? null;
    }
    return null;
}

function listActivitiesForPlan(planId: number) {
    return getDb().prepare(`
        SELECT
            s.id,
            s.location_id as locationId,
            l.name as locationName,
            s.sort_order as sortOrder,
            s.name,
            s.lat,
            s.lng,
            s.duration_minutes as durationMinutes,
            s.duration_days as durationDays,
            s.scheduled_date as scheduledDate,
            s.scheduled_period as scheduledPeriod,
            s.scheduled_time as scheduledTime,
            s.description,
            s.activity_type as activityType,
            s.transport_type as transportType,
            s.pricing_mode as pricingMode,
            s.unit_price as unitPrice,
            s.quantity,
            s.surcharge,
            s.adult_price as adultPrice,
            s.child_price as childPrice,
            s.participant_adults as participantAdults,
            s.participant_children as participantChildren
        FROM sub_locations s
        JOIN locations l ON l.id = s.location_id
        WHERE l.plan_id = ?
        ORDER BY l.sort_order ASC, s.sort_order ASC, s.id ASC
    `).all(planId);
}

function activityBelongsToPlan(planId: number, activityId: number): boolean {
    return !!getDb().prepare(`
        SELECT s.id
        FROM sub_locations s
        JOIN locations l ON l.id = s.location_id
        WHERE s.id = ? AND l.plan_id = ?
    `).get(activityId, planId);
}

function insertActivity(locationId: number, input: ActivityInput) {
    if (!input.name?.trim()) return { error: 'name is required' };
    const db = getDb();
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(locationId) as { m: number | null }).m ?? 0;
    const result = db.prepare(
        'INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, duration_days, scheduled_date, scheduled_period, scheduled_time, description, activity_type, transport_type, pricing_mode, unit_price, quantity, surcharge, adult_price, child_price, participant_adults, participant_children) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(locationId, input.sortOrder ?? maxOrder + 1, input.name, input.lat ?? 0, input.lng ?? 0, input.durationMinutes ?? 60, input.durationDays ?? 0, input.scheduledDate ?? '', input.scheduledPeriod ?? '', input.scheduledTime ?? '', input.description ?? '', input.activityType ?? 'sightseeing', input.transportType ?? '', input.pricingMode ?? 'per_person', input.unitPrice ?? 0, input.quantity ?? 1, input.surcharge ?? 0, input.adultPrice ?? 0, input.childPrice ?? 0, input.participantAdults ?? null, input.participantChildren ?? null);
    return { id: result.lastInsertRowid };
}

function updateActivity(activityId: number, input: ActivityInput): boolean {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM sub_locations WHERE id = ?').get(activityId) as { id: number } | undefined;
    if (!existing) return false;

    const map: Record<string, unknown> = {
        name: input.name,
        lat: input.lat,
        lng: input.lng,
        sort_order: input.sortOrder,
        duration_minutes: input.durationMinutes,
        duration_days: input.durationDays,
        scheduled_date: input.scheduledDate,
        scheduled_period: input.scheduledPeriod,
        scheduled_time: input.scheduledTime,
        description: input.description,
        activity_type: input.activityType,
        transport_type: input.transportType,
        pricing_mode: input.pricingMode,
        unit_price: input.unitPrice,
        quantity: input.quantity,
        surcharge: input.surcharge,
        adult_price: input.adultPrice,
        child_price: input.childPrice,
        participant_adults: input.participantAdults,
        participant_children: input.participantChildren,
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(map)) {
        if (value !== undefined) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }
    if (!fields.length) return true;
    values.push(activityId);
    db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return true;
}

function deleteActivity(activityId: number): boolean {
    return getDb().prepare('DELETE FROM sub_locations WHERE id = ?').run(activityId).changes > 0;
}

router.get('/plans/:slug/activities', (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    res.json(listActivitiesForPlan(planId));
});

router.post('/plans/:slug/activities', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = getLocationId(planId, req.body as ActivityInput);
    if (!locationId) { res.status(404).json({ error: 'Location not found. Provide locationId or locationName.' }); return; }
    const result = insertActivity(locationId, req.body as ActivityInput);
    if ('error' in result) { res.status(400).json({ error: result.error }); return; }
    res.status(201).json(result);
});

router.put('/plans/:slug/activities/:activityId', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    const activityId = Number(req.params.activityId);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (!activityBelongsToPlan(planId, activityId)) { res.status(404).json({ error: 'Activity not found' }); return; }
    if (!updateActivity(activityId, req.body as ActivityInput)) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

router.patch('/plans/:slug/activities/:activityId', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    const activityId = Number(req.params.activityId);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (!activityBelongsToPlan(planId, activityId)) { res.status(404).json({ error: 'Activity not found' }); return; }
    if (!updateActivity(activityId, req.body as ActivityInput)) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

router.delete('/plans/:slug/activities/:activityId', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    const activityId = Number(req.params.activityId);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (!activityBelongsToPlan(planId, activityId)) { res.status(404).json({ error: 'Activity not found' }); return; }
    if (!deleteActivity(activityId)) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

router.post('/sub-locations', requireAuth, (req, res) => {
    const input = req.body as ActivityInput;
    if (!input.planSlug) { res.status(400).json({ error: 'planSlug is required' }); return; }
    const planId = getPlanIdBySlug(input.planSlug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = getLocationId(planId, input);
    if (!locationId) { res.status(404).json({ error: 'Location not found. Provide locationId or locationName.' }); return; }
    const result = insertActivity(locationId, input);
    if ('error' in result) { res.status(400).json({ error: result.error }); return; }
    res.status(201).json(result);
});

router.put('/sub-locations/:activityId', requireAuth, (req, res) => {
    if (!updateActivity(Number(req.params.activityId), req.body as ActivityInput)) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

router.patch('/sub-locations/:activityId', requireAuth, (req, res) => {
    if (!updateActivity(Number(req.params.activityId), req.body as ActivityInput)) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

router.delete('/sub-locations/:activityId', requireAuth, (req, res) => {
    if (!deleteActivity(Number(req.params.activityId))) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

router.get('/sub-locations', (req, res) => {
    const slug = req.query.planSlug ?? req.query.slug;
    if (typeof slug !== 'string') { res.status(400).json({ error: 'planSlug or slug query is required' }); return; }
    const planId = getPlanIdBySlug(slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    res.json(listActivitiesForPlan(planId));
});

router.get('/activities', (req, res) => {
    const slug = req.query.planSlug ?? req.query.slug;
    if (typeof slug !== 'string') { res.status(400).json({ error: 'planSlug or slug query is required' }); return; }
    const planId = getPlanIdBySlug(slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    res.json(listActivitiesForPlan(planId));
});

router.post('/activities', requireAuth, (req, res) => {
    const input = req.body as ActivityInput;
    if (!input.planSlug) { res.status(400).json({ error: 'planSlug is required' }); return; }
    const planId = getPlanIdBySlug(input.planSlug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = getLocationId(planId, input);
    if (!locationId) { res.status(404).json({ error: 'Location not found. Provide locationId or locationName.' }); return; }
    const result = insertActivity(locationId, input);
    if ('error' in result) { res.status(400).json({ error: result.error }); return; }
    res.status(201).json(result);
});

router.put('/activities/:activityId', requireAuth, (req, res) => {
    if (!updateActivity(Number(req.params.activityId), req.body as ActivityInput)) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

router.patch('/activities/:activityId', requireAuth, (req, res) => {
    if (!updateActivity(Number(req.params.activityId), req.body as ActivityInput)) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

router.delete('/activities/:activityId', requireAuth, (req, res) => {
    if (!deleteActivity(Number(req.params.activityId))) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json({ ok: true });
});

export default router;
