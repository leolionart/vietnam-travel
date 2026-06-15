import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/connection.js';
import { createPublicSessionPlan, getPlanBySessionId } from '../services/planService.js';
import { addLocation, updateLocation, deleteLocation, reorderLocations } from '../services/locationService.js';

const router = Router();

function generateSessionId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
}

// Lấy planId từ slug — chỉ cho phép session plans (không lấy admin plans)
function getSessionPlanId(slug: string): number | null {
    const db = getDb();
    const plan = db.prepare('SELECT id FROM plans WHERE slug = ? AND session_id IS NOT NULL').get(slug) as { id: number } | undefined;
    return plan?.id ?? null;
}

function getLocationForPlan(planId: number, locationId: number): boolean {
    return !!getDb().prepare('SELECT id FROM locations WHERE id = ? AND plan_id = ?').get(locationId, planId);
}

function getSubLocationForPlan(planId: number, subId: number): boolean {
    return !!getDb().prepare(`
        SELECT s.id
        FROM sub_locations s
        JOIN locations l ON l.id = s.location_id
        WHERE s.id = ? AND l.plan_id = ?
    `).get(subId, planId);
}

// POST /api/public/plans — tạo session plan (không có trong admin list, chỉ truy cập qua sessionId)
router.post('/plans', (req, res) => {
    const { slug, name, dateRange, budgetLimit } = req.body as { slug?: string; name?: string; dateRange?: string; budgetLimit?: number };
    if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    const sessionId = generateSessionId();
    const plan = createPublicSessionPlan({ slug, name, dateRange, budgetLimit, sessionId });
    res.status(201).json({ ...plan, sessionId });
});

// DELETE /api/public/plans/:slug
router.delete('/plans/:slug', (req, res) => {
    const db = getDb();
    const result = db.prepare('DELETE FROM plans WHERE slug = ? AND session_id IS NOT NULL').run(req.params.slug);
    if (result.changes === 0) { res.status(404).json({ error: 'Plan not found' }); return; }
    res.json({ ok: true });
});

// PATCH /api/public/plans/:slug
router.patch('/plans/:slug', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const { name, slug, dateRange, budgetLimit } = req.body as { name?: string; slug?: string; dateRange?: string; budgetLimit?: number };
    const db = getDb();
    if (name !== undefined) db.prepare('UPDATE plans SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), planId);
    if (slug !== undefined) db.prepare('UPDATE plans SET slug = ?, updated_at = ? WHERE id = ?').run(slug, Date.now(), planId);
    if (dateRange !== undefined) db.prepare('UPDATE plans SET date_range = ?, updated_at = ? WHERE id = ?').run(dateRange, Date.now(), planId);
    if (budgetLimit !== undefined) {
        const budget = Number(budgetLimit);
        if (!Number.isFinite(budget) || budget <= 0) { res.status(400).json({ error: 'budgetLimit must be a positive number' }); return; }
        db.prepare('UPDATE plans SET budget_limit = ?, updated_at = ? WHERE id = ?').run(Math.round(budget), Date.now(), planId);
    }
    const plan = db.prepare('SELECT session_id FROM plans WHERE id = ?').get(planId) as { session_id: string };
    res.json(getPlanBySessionId(plan.session_id));
});

// POST /api/public/plans/:slug/locations
router.post('/plans/:slug/locations', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const id = addLocation(planId, req.body);
    res.status(201).json({ id });
});

// PUT /api/public/plans/:slug/locations/:id
router.put('/plans/:slug/locations/:id', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const ok = updateLocation(planId, Number(req.params.id), req.body);
    if (!ok) { res.status(404).json({ error: 'Location not found' }); return; }
    // Trả về plan theo sessionId để MCP có thể verify
    const plan = getDb().prepare('SELECT session_id FROM plans WHERE id = ?').get(planId) as { session_id: string };
    res.json(getPlanBySessionId(plan.session_id));
});

// PATCH /api/public/plans/:slug/locations/:id
router.patch('/plans/:slug/locations/:id', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const ok = updateLocation(planId, Number(req.params.id), req.body);
    if (!ok) { res.status(404).json({ error: 'Location not found' }); return; }
    const plan = getDb().prepare('SELECT session_id FROM plans WHERE id = ?').get(planId) as { session_id: string };
    res.json(getPlanBySessionId(plan.session_id));
});

// DELETE /api/public/plans/:slug/locations/:id
router.delete('/plans/:slug/locations/:id', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (!deleteLocation(planId, Number(req.params.id))) { res.status(404).json({ error: 'Location not found' }); return; }
    res.json({ ok: true });
});

// PATCH /api/public/plans/:slug/locations/reorder
router.patch('/plans/:slug/locations/reorder', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const { orderedIds } = req.body as { orderedIds?: number[] };
    if (!Array.isArray(orderedIds)) { res.status(400).json({ error: 'orderedIds must be an array' }); return; }
    reorderLocations(planId, orderedIds);
    const plan = getDb().prepare('SELECT session_id FROM plans WHERE id = ?').get(planId) as { session_id: string };
    res.json(getPlanBySessionId(plan.session_id));
});

// POST /api/public/plans/:slug/locations/:id/sub-locations
router.post('/plans/:slug/locations/:id/sub-locations', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const { name, address, externalUrl, externalLabel, lat, lng, durationMinutes, durationDays, scheduledDate, scheduledPeriod, scheduledTime, description, sortOrder, activityType, transportType, pricingMode, unitPrice, quantity, surcharge, adultPrice, childPrice, participantAdults, participantChildren } = req.body as {
        name?: string; address?: string; externalUrl?: string; externalLabel?: string; lat?: number; lng?: number; durationMinutes?: number; durationDays?: number; scheduledDate?: string; scheduledPeriod?: string; scheduledTime?: string; description?: string; sortOrder?: number; activityType?: string; transportType?: string; pricingMode?: string; unitPrice?: number; quantity?: number; surcharge?: number; adultPrice?: number; childPrice?: number; participantAdults?: number | null; participantChildren?: number | null;
    };
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

    const db = getDb();
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(locationId) as { m: number | null }).m ?? 0;
    const result = db.prepare(
        'INSERT INTO sub_locations (location_id, sort_order, name, address, external_url, external_label, lat, lng, duration_minutes, duration_days, scheduled_date, scheduled_period, scheduled_time, description, activity_type, transport_type, pricing_mode, unit_price, quantity, surcharge, adult_price, child_price, participant_adults, participant_children) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(locationId, sortOrder ?? maxOrder + 1, name, address ?? '', externalUrl ?? '', externalLabel ?? '', lat ?? 0, lng ?? 0, durationMinutes ?? 60, durationDays ?? 0, scheduledDate ?? '', scheduledPeriod ?? '', scheduledTime ?? '', description ?? '', activityType ?? 'sightseeing', transportType ?? '', pricingMode ?? 'per_person', unitPrice ?? 0, quantity ?? 1, surcharge ?? 0, adultPrice ?? 0, childPrice ?? 0, participantAdults ?? null, participantChildren ?? null);
    res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/public/plans/:slug/locations/:id/sub-locations/:subId
router.put('/plans/:slug/locations/:id/sub-locations/:subId', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const subId = Number(req.params.subId);
    const db = getDb();
    if (!getSubLocationForPlan(planId, subId)) {
        res.status(404).json({ error: 'Sub-location not found' }); return;
    }

    const { name, address, externalUrl, externalLabel, lat, lng, durationMinutes, durationDays, scheduledDate, scheduledPeriod, scheduledTime, description, sortOrder, activityType, transportType, pricingMode, unitPrice, quantity, surcharge, adultPrice, childPrice, participantAdults, participantChildren } = req.body as {
        name?: string; address?: string; externalUrl?: string; externalLabel?: string; lat?: number; lng?: number; durationMinutes?: number; durationDays?: number; scheduledDate?: string; scheduledPeriod?: string; scheduledTime?: string; description?: string; sortOrder?: number; activityType?: string; transportType?: string; pricingMode?: string; unitPrice?: number; quantity?: number; surcharge?: number; adultPrice?: number; childPrice?: number; participantAdults?: number | null; participantChildren?: number | null;
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (address !== undefined) { fields.push('address = ?'); values.push(address); }
    if (externalUrl !== undefined) { fields.push('external_url = ?'); values.push(externalUrl); }
    if (externalLabel !== undefined) { fields.push('external_label = ?'); values.push(externalLabel); }
    if (lat !== undefined) { fields.push('lat = ?'); values.push(lat); }
    if (lng !== undefined) { fields.push('lng = ?'); values.push(lng); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
    if (durationMinutes !== undefined) { fields.push('duration_minutes = ?'); values.push(durationMinutes); }
    if (durationDays !== undefined) { fields.push('duration_days = ?'); values.push(durationDays); }
    if (scheduledDate !== undefined) { fields.push('scheduled_date = ?'); values.push(scheduledDate); }
    if (scheduledPeriod !== undefined) { fields.push('scheduled_period = ?'); values.push(scheduledPeriod); }
    if (scheduledTime !== undefined) { fields.push('scheduled_time = ?'); values.push(scheduledTime); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (activityType !== undefined) { fields.push('activity_type = ?'); values.push(activityType); }
    if (transportType !== undefined) { fields.push('transport_type = ?'); values.push(transportType); }
    if (pricingMode !== undefined) { fields.push('pricing_mode = ?'); values.push(pricingMode); }
    if (unitPrice !== undefined) { fields.push('unit_price = ?'); values.push(unitPrice); }
    if (quantity !== undefined) { fields.push('quantity = ?'); values.push(quantity); }
    if (surcharge !== undefined) { fields.push('surcharge = ?'); values.push(surcharge); }
    if (adultPrice !== undefined) { fields.push('adult_price = ?'); values.push(adultPrice); }
    if (childPrice !== undefined) { fields.push('child_price = ?'); values.push(childPrice); }
    if (participantAdults !== undefined) { fields.push('participant_adults = ?'); values.push(participantAdults); }
    if (participantChildren !== undefined) { fields.push('participant_children = ?'); values.push(participantChildren); }
    if (fields.length > 0) {
        values.push(subId);
        db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    res.json({ ok: true });
});

// DELETE /api/public/plans/:slug/locations/:id/sub-locations/:subId
router.delete('/plans/:slug/locations/:id/sub-locations/:subId', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const result = getDb().prepare('DELETE FROM sub_locations WHERE id = ? AND location_id = ?').run(Number(req.params.subId), locationId);
    if (result.changes === 0) { res.status(404).json({ error: 'Sub-location not found' }); return; }
    res.json({ ok: true });
});

// PATCH /api/public/plans/:slug/locations/:id/sub-locations/reorder
router.patch('/plans/:slug/locations/:id/sub-locations/reorder', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const { orderedIds, schedules } = req.body as { orderedIds?: number[]; schedules?: Array<{ id: number; scheduledDate: string; scheduledPeriod: string; scheduledTime?: string }> };
    if (!Array.isArray(orderedIds)) { res.status(400).json({ error: 'orderedIds must be an array' }); return; }

    const db = getDb();
    const update = db.prepare('UPDATE sub_locations SET sort_order = ? WHERE id = ? AND location_id = ?');
    const updateSchedule = db.prepare('UPDATE sub_locations SET scheduled_date = ?, scheduled_period = ?, scheduled_time = ? WHERE id = ? AND location_id = ?');
    const tx = db.transaction(() => {
        orderedIds.forEach((id, idx) => update.run(idx, id, locationId));
        if (Array.isArray(schedules)) {
            schedules.forEach(item => updateSchedule.run(item.scheduledDate || '', item.scheduledPeriod || '', item.scheduledTime || '', item.id, locationId));
        }
    });
    tx();
    res.json({ ok: true });
});

export default router;
