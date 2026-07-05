import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/connection.js';
import {
    listPlans,
    getPlanBySlug,
    createPlan,
    updatePlan,
    deletePlan,
} from '../services/planService.js';
import {
    addLocation,
    updateLocation,
    deleteLocation,
    reorderLocations,
} from '../services/locationService.js';
import { analyzePlanBySlug } from '../services/activityAnalysisService.js';

const router = Router();

// GET /api/plans
router.get('/', (_req, res) => {
    res.json(listPlans());
});

// GET /api/plans/:slug
router.get('/:slug', (req, res) => {
    const plan = getPlanBySlug(req.params.slug);
    if (!plan) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    res.json(plan);
});

// GET /api/plans/:slug/activity-analysis
router.get('/:slug/activity-analysis', (req, res) => {
    const locationId = req.query.locationId !== undefined ? Number(req.query.locationId) : undefined;
    const maxDistanceKm = req.query.maxDistanceKm !== undefined ? Number(req.query.maxDistanceKm) : undefined;
    const transportType = typeof req.query.transportType === 'string' ? req.query.transportType : undefined;
    if (locationId !== undefined && !Number.isFinite(locationId)) {
        res.status(400).json({ error: 'locationId must be a number' });
        return;
    }
    if (maxDistanceKm !== undefined && !Number.isFinite(maxDistanceKm)) {
        res.status(400).json({ error: 'maxDistanceKm must be a number' });
        return;
    }
    const analysis = analyzePlanBySlug(req.params.slug, { locationId, maxDistanceKm, transportType: transportType as never });
    if (!analysis) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    res.json(analysis);
});

// POST /api/plans
router.post('/', requireAuth, (req, res) => {
    const { slug, name, dateRange, budgetLimit } = req.body as { slug?: string; name?: string; dateRange?: string; budgetLimit?: number };
    if (!slug || !name) {
        res.status(400).json({ error: 'slug and name are required' });
        return;
    }
    try {
        const plan = createPlan({ slug, name, dateRange, budgetLimit });
        res.status(201).json(plan);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE')) {
            res.status(409).json({ error: 'Slug already exists' });
        } else {
            throw err;
        }
    }
});

// PUT /api/plans/:slug
router.put('/:slug', requireAuth, (req, res) => {
    const plan = updatePlan(req.params.slug, req.body as { name?: string; slug?: string; dateRange?: string; budgetLimit?: number });
    if (!plan) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    res.json(plan);
});

// PATCH /api/plans/:slug
router.patch('/:slug', requireAuth, (req, res) => {
    const plan = updatePlan(req.params.slug, req.body as { name?: string; slug?: string; dateRange?: string; budgetLimit?: number });
    if (!plan) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    res.json(plan);
});

// DELETE /api/plans/:slug
router.delete('/:slug', requireAuth, (req, res) => {
    const ok = deletePlan(req.params.slug);
    if (!ok) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    res.json({ ok: true });
});

// --- Location routes ---

function getPlanIdBySlug(slug: string): number | null {
    const db = getDb();
    const plan = db.prepare('SELECT id FROM plans WHERE slug = ?').get(slug) as { id: number } | undefined;
    return plan?.id ?? null;
}

// POST /api/plans/:slug/locations
router.post('/:slug/locations', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    const id = addLocation(planId, req.body);
    res.status(201).json({ id });
});

// PUT /api/plans/:slug/locations/:id
router.put('/:slug/locations/:id', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    const ok = updateLocation(planId, Number(req.params.id), req.body);
    if (!ok) {
        res.status(404).json({ error: 'Location not found' });
        return;
    }
    res.json(getPlanBySlug(req.params.slug));
});

// PATCH /api/plans/:slug/locations/:id
router.patch('/:slug/locations/:id', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    const ok = updateLocation(planId, Number(req.params.id), req.body);
    if (!ok) {
        res.status(404).json({ error: 'Location not found' });
        return;
    }
    res.json(getPlanBySlug(req.params.slug));
});

// DELETE /api/plans/:slug/locations/:id
router.delete('/:slug/locations/:id', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    const ok = deleteLocation(planId, Number(req.params.id));
    if (!ok) {
        res.status(404).json({ error: 'Location not found' });
        return;
    }
    res.json({ ok: true });
});

// PATCH /api/plans/:slug/locations/reorder
router.patch('/:slug/locations/reorder', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) {
        res.status(404).json({ error: 'Plan not found' });
        return;
    }
    const { orderedIds } = req.body as { orderedIds?: number[] };
    if (!Array.isArray(orderedIds)) {
        res.status(400).json({ error: 'orderedIds must be an array' });
        return;
    }
    reorderLocations(planId, orderedIds);
    res.json(getPlanBySlug(req.params.slug));
});

// --- Sub-location routes ---

function getLocationForPlan(planId: number, locationId: number): { id: number } | null {
    const db = getDb();
    const loc = db.prepare('SELECT id FROM locations WHERE id = ? AND plan_id = ?').get(locationId, planId) as { id: number } | undefined;
    return loc ?? null;
}

function getSubLocationForPlan(planId: number, subId: number): { id: number } | null {
    const db = getDb();
    const sub = db.prepare(`
        SELECT s.id
        FROM sub_locations s
        JOIN locations l ON l.id = s.location_id
        WHERE s.id = ? AND l.plan_id = ?
    `).get(subId, planId) as { id: number } | undefined;
    return sub ?? null;
}

// POST /api/plans/:slug/locations/:id/sub-locations
router.post('/:slug/locations/:id/sub-locations', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const { name, address, externalUrl, externalLabel, lat, lng, durationMinutes, durationDays, scheduledDate, scheduledPeriod, scheduledTime, description, sortOrder, activityType, transportType, pricingMode, unitPrice, quantity, surcharge, adultPrice, childPrice, participantAdults, participantChildren, actualCost } = req.body as {
        name?: string; address?: string; externalUrl?: string; externalLabel?: string; lat?: number; lng?: number; durationMinutes?: number; durationDays?: number; scheduledDate?: string; scheduledPeriod?: string; scheduledTime?: string; description?: string; sortOrder?: number; activityType?: string; transportType?: string; pricingMode?: string; unitPrice?: number; quantity?: number; surcharge?: number; adultPrice?: number; childPrice?: number; participantAdults?: number | null; participantChildren?: number | null; actualCost?: number;
    };
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

    const db = getDb();
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(locationId) as { m: number | null }).m ?? 0;
    const result = db.prepare(
        'INSERT INTO sub_locations (location_id, sort_order, name, address, external_url, external_label, lat, lng, duration_minutes, duration_days, scheduled_date, scheduled_period, scheduled_time, description, activity_type, transport_type, pricing_mode, unit_price, quantity, surcharge, adult_price, child_price, participant_adults, participant_children, actual_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(locationId, sortOrder ?? maxOrder + 1, name, address ?? '', externalUrl ?? '', externalLabel ?? '', lat ?? 0, lng ?? 0, durationMinutes ?? 60, durationDays ?? 0, scheduledDate ?? '', scheduledPeriod ?? '', scheduledTime ?? '', description ?? '', activityType ?? 'sightseeing', transportType ?? '', pricingMode ?? 'per_person', unitPrice ?? 0, quantity ?? 1, surcharge ?? 0, adultPrice ?? 0, childPrice ?? 0, participantAdults ?? null, participantChildren ?? null, actualCost ?? 0);

    res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/plans/:slug/locations/:id/sub-locations/:subId
router.put('/:slug/locations/:id/sub-locations/:subId', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const subId = Number(req.params.subId);
    const db = getDb();
    const existing = getSubLocationForPlan(planId, subId);
    if (!existing) { res.status(404).json({ error: 'Sub-location not found' }); return; }

    const { name, address, externalUrl, externalLabel, lat, lng, durationMinutes, durationDays, scheduledDate, scheduledPeriod, scheduledTime, description, sortOrder, activityType, transportType, pricingMode, unitPrice, quantity, surcharge, adultPrice, childPrice, participantAdults, participantChildren, actualCost } = req.body as {
        name?: string; address?: string; externalUrl?: string; externalLabel?: string; lat?: number; lng?: number; durationMinutes?: number; durationDays?: number; scheduledDate?: string; scheduledPeriod?: string; scheduledTime?: string; description?: string; sortOrder?: number; activityType?: string; transportType?: string; pricingMode?: string; unitPrice?: number; quantity?: number; surcharge?: number; adultPrice?: number; childPrice?: number; participantAdults?: number | null; participantChildren?: number | null; actualCost?: number;
    };

    const fields: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (address !== undefined) { fields.push('address = ?'); values.push(address); }
    if (externalUrl !== undefined) { fields.push('external_url = ?'); values.push(externalUrl); }
    if (externalLabel !== undefined) { fields.push('external_label = ?'); values.push(externalLabel); }
    if (lat !== undefined) { fields.push('lat = ?'); values.push(lat); }
    if (lng !== undefined) { fields.push('lng = ?'); values.push(lng); }
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
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
    if (adultPrice !== undefined) { fields.push('adult_price = ?'); values.push(adultPrice); }
    if (childPrice !== undefined) { fields.push('child_price = ?'); values.push(childPrice); }
    if (participantAdults !== undefined) { fields.push('participant_adults = ?'); values.push(participantAdults); }
    if (participantChildren !== undefined) { fields.push('participant_children = ?'); values.push(participantChildren); }
    if (actualCost !== undefined) { fields.push('actual_cost = ?'); values.push(actualCost); }

    if (fields.length > 0) {
        values.push(subId);
        db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({ ok: true });
});

// PATCH /api/plans/:slug/locations/:id/sub-locations/:subId
router.patch('/:slug/locations/:id/sub-locations/:subId', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const subId = Number(req.params.subId);
    const db = getDb();
    const existing = getSubLocationForPlan(planId, subId);
    if (!existing) { res.status(404).json({ error: 'Sub-location not found' }); return; }

    const { name, address, externalUrl, externalLabel, lat, lng, durationMinutes, durationDays, scheduledDate, scheduledPeriod, scheduledTime, description, sortOrder, activityType, transportType, pricingMode, unitPrice, quantity, surcharge, adultPrice, childPrice, participantAdults, participantChildren, actualCost } = req.body as {
        name?: string; address?: string; externalUrl?: string; externalLabel?: string; lat?: number; lng?: number; durationMinutes?: number; durationDays?: number; scheduledDate?: string; scheduledPeriod?: string; scheduledTime?: string; description?: string; sortOrder?: number; activityType?: string; transportType?: string; pricingMode?: string; unitPrice?: number; quantity?: number; surcharge?: number; adultPrice?: number; childPrice?: number; participantAdults?: number | null; participantChildren?: number | null; actualCost?: number;
    };

    const fields: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (address !== undefined) { fields.push('address = ?'); values.push(address); }
    if (externalUrl !== undefined) { fields.push('external_url = ?'); values.push(externalUrl); }
    if (externalLabel !== undefined) { fields.push('external_label = ?'); values.push(externalLabel); }
    if (lat !== undefined) { fields.push('lat = ?'); values.push(lat); }
    if (lng !== undefined) { fields.push('lng = ?'); values.push(lng); }
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
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
    if (adultPrice !== undefined) { fields.push('adult_price = ?'); values.push(adultPrice); }
    if (childPrice !== undefined) { fields.push('child_price = ?'); values.push(childPrice); }
    if (participantAdults !== undefined) { fields.push('participant_adults = ?'); values.push(participantAdults); }
    if (participantChildren !== undefined) { fields.push('participant_children = ?'); values.push(participantChildren); }
    if (actualCost !== undefined) { fields.push('actual_cost = ?'); values.push(actualCost); }

    if (fields.length > 0) {
        values.push(subId);
        db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({ ok: true });
});

// DELETE /api/plans/:slug/locations/:id/sub-locations/:subId
router.delete('/:slug/locations/:id/sub-locations/:subId', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const db = getDb();
    const result = db.prepare('DELETE FROM sub_locations WHERE id = ? AND location_id = ?').run(Number(req.params.subId), locationId);
    if (result.changes === 0) { res.status(404).json({ error: 'Sub-location not found' }); return; }
    res.json({ ok: true });
});

// PATCH /api/plans/:slug/locations/:id/sub-locations/reorder
router.patch('/:slug/locations/:id/sub-locations/reorder', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
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
