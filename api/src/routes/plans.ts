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

// POST /api/plans
router.post('/', requireAuth, (req, res) => {
    const { slug, name, dateRange } = req.body as { slug?: string; name?: string; dateRange?: string };
    if (!slug || !name) {
        res.status(400).json({ error: 'slug and name are required' });
        return;
    }
    try {
        const plan = createPlan({ slug, name, dateRange });
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
    const plan = updatePlan(req.params.slug, req.body as { name?: string; slug?: string });
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

// POST /api/plans/:slug/locations/:id/sub-locations
router.post('/:slug/locations/:id/sub-locations', requireAuth, (req, res) => {
    const planId = getPlanIdBySlug(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const { name, lat, lng, durationMinutes, description, sortOrder, adultPrice, childPrice } = req.body as {
        name?: string; lat?: number; lng?: number; durationMinutes?: number; description?: string; sortOrder?: number; adultPrice?: number; childPrice?: number;
    };
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

    const db = getDb();
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(locationId) as { m: number | null }).m ?? 0;
    const result = db.prepare(
        'INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(locationId, sortOrder ?? maxOrder + 1, name, lat ?? 0, lng ?? 0, durationMinutes ?? 60, description ?? '', adultPrice ?? 0, childPrice ?? 0);

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
    const existing = db.prepare('SELECT id FROM sub_locations WHERE id = ? AND location_id = ?').get(subId, locationId) as { id: number } | undefined;
    if (!existing) { res.status(404).json({ error: 'Sub-location not found' }); return; }

    const { name, lat, lng, durationMinutes, description, sortOrder, adultPrice, childPrice } = req.body as {
        name?: string; lat?: number; lng?: number; durationMinutes?: number; description?: string; sortOrder?: number; adultPrice?: number; childPrice?: number;
    };

    const fields: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (lat !== undefined) { fields.push('lat = ?'); values.push(lat); }
    if (lng !== undefined) { fields.push('lng = ?'); values.push(lng); }
    if (durationMinutes !== undefined) { fields.push('duration_minutes = ?'); values.push(durationMinutes); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
    if (adultPrice !== undefined) { fields.push('adult_price = ?'); values.push(adultPrice); }
    if (childPrice !== undefined) { fields.push('child_price = ?'); values.push(childPrice); }

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

    const { orderedIds } = req.body as { orderedIds?: number[] };
    if (!Array.isArray(orderedIds)) { res.status(400).json({ error: 'orderedIds must be an array' }); return; }

    const db = getDb();
    const update = db.prepare('UPDATE sub_locations SET sort_order = ? WHERE id = ? AND location_id = ?');
    const tx = db.transaction(() => {
        orderedIds.forEach((id, idx) => update.run(idx, id, locationId));
    });
    tx();
    res.json({ ok: true });
});

export default router;
