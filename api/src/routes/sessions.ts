import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/connection.js';
import { getPlanBySessionId } from '../services/planService.js';

const router = Router();

interface SessionRow {
    id: string;
    plan_slug: string;
    custom: string;
    created_at: number;
    updated_at: number;
}

function generateId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 12);
}

// GET /api/sessions/plan/:id — lấy session plan (tạo bởi public MCP)
router.get('/plan/:id', (req, res) => {
    const plan = getPlanBySessionId(req.params.id);
    if (!plan) {
        res.status(404).json({ error: 'Session plan not found' });
        return;
    }
    res.json(plan);
});

// POST /api/sessions — tạo session mới
router.post('/', (req, res) => {
    const { planSlug, custom } = req.body as { planSlug?: string; custom?: unknown };
    if (!planSlug || typeof planSlug !== 'string') {
        res.status(400).json({ error: 'planSlug is required' });
        return;
    }

    const db = getDb();
    const id = generateId();
    const customJson = JSON.stringify(custom ?? {});
    const now = Date.now();

    db.prepare(
        'INSERT INTO user_sessions (id, plan_slug, custom, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, planSlug, customJson, now, now);

    res.status(201).json({ id, planSlug, custom: custom ?? {} });
});

// GET /api/sessions/:id — lấy session
router.get('/:id', (req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM user_sessions WHERE id = ?').get(req.params.id) as SessionRow | undefined;

    if (!row) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    res.json({
        id: row.id,
        planSlug: row.plan_slug,
        custom: JSON.parse(row.custom),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
});

// PATCH /api/sessions/:id — cập nhật customizations
router.patch('/:id', (req, res) => {
    const { custom } = req.body as { custom?: unknown };
    if (custom === undefined) {
        res.status(400).json({ error: 'custom is required' });
        return;
    }

    const db = getDb();
    const result = db.prepare(
        'UPDATE user_sessions SET custom = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(custom), Date.now(), req.params.id);

    if (result.changes === 0) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    res.json({ id: req.params.id, custom });
});

export default router;
