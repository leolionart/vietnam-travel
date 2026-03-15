import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/connection.js';
import { getPlanBySessionId, createSessionPlan } from '../services/planService.js';
import { addLocation, updateLocation, deleteLocation } from '../services/locationService.js';

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

// POST /api/public/plans — tạo session plan (không có trong admin list, chỉ truy cập qua sessionId)
router.post('/plans', (req, res) => {
    const { slug, name, dateRange } = req.body as { slug?: string; name?: string; dateRange?: string };
    if (!slug || !name) {
        res.status(400).json({ error: 'slug and name are required' });
        return;
    }
    const sessionId = generateSessionId();
    try {
        const plan = createSessionPlan({ slug, name, dateRange, sessionId });
        res.status(201).json({ ...plan, sessionId });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE')) {
            res.status(409).json({ error: 'Slug already exists' });
        } else {
            throw err;
        }
    }
});

// DELETE /api/public/plans/:slug
router.delete('/plans/:slug', (req, res) => {
    const db = getDb();
    const result = db.prepare('DELETE FROM plans WHERE slug = ? AND session_id IS NOT NULL').run(req.params.slug);
    if (result.changes === 0) { res.status(404).json({ error: 'Plan not found' }); return; }
    res.json({ ok: true });
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

// DELETE /api/public/plans/:slug/locations/:id
router.delete('/plans/:slug/locations/:id', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (!deleteLocation(planId, Number(req.params.id))) { res.status(404).json({ error: 'Location not found' }); return; }
    res.json({ ok: true });
});

// POST /api/public/plans/:slug/locations/:id/sub-locations
router.post('/plans/:slug/locations/:id/sub-locations', (req, res) => {
    const planId = getSessionPlanId(req.params.slug);
    if (!planId) { res.status(404).json({ error: 'Plan not found' }); return; }
    const locationId = Number(req.params.id);
    if (!getLocationForPlan(planId, locationId)) { res.status(404).json({ error: 'Location not found' }); return; }

    const { name, lat, lng, durationMinutes, description, adultPrice, childPrice } = req.body as {
        name?: string; lat?: number; lng?: number; durationMinutes?: number; description?: string; adultPrice?: number; childPrice?: number;
    };
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

    const db = getDb();
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(locationId) as { m: number | null }).m ?? 0;
    const result = db.prepare(
        'INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(locationId, maxOrder + 1, name, lat ?? 0, lng ?? 0, durationMinutes ?? 60, description ?? '', adultPrice ?? 0, childPrice ?? 0);
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
    if (!db.prepare('SELECT id FROM sub_locations WHERE id = ? AND location_id = ?').get(subId, locationId)) {
        res.status(404).json({ error: 'Sub-location not found' }); return;
    }

    const { name, lat, lng, durationMinutes, description, adultPrice, childPrice } = req.body as {
        name?: string; lat?: number; lng?: number; durationMinutes?: number; description?: string; adultPrice?: number; childPrice?: number;
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (lat !== undefined) { fields.push('lat = ?'); values.push(lat); }
    if (lng !== undefined) { fields.push('lng = ?'); values.push(lng); }
    if (durationMinutes !== undefined) { fields.push('duration_minutes = ?'); values.push(durationMinutes); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (adultPrice !== undefined) { fields.push('adult_price = ?'); values.push(adultPrice); }
    if (childPrice !== undefined) { fields.push('child_price = ?'); values.push(childPrice); }
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

export default router;
