import { Router } from 'express';
import { buildVexereUrl, getProvinceId, searchTrips, isVexereConfigured } from '../lib/vexere.js';

const router = Router();

// GET /api/vexere-link?from=Hà Nội&to=Nghệ An&date=18/06/2026&type=SLEEPING
// Returns a deeplink URL (no auth required)
router.get('/', (req, res) => {
    const { from, to, date, type } = req.query as Record<string, string>;
    if (!from || !to || !date) {
        res.status(400).json({ error: 'from, to, and date are required' });
        return;
    }
    const url = buildVexereUrl({ fromProvince: from, toProvince: to, travelDate: date, type });
    if (!url) {
        res.status(422).json({
            error: 'Unknown province',
            fromId: getProvinceId(from),
            toId: getProvinceId(to),
        });
        return;
    }
    res.json({ url });
});

// GET /api/vexere-link/trips?from=Hà Nội&to=Nghệ An&date=2026-06-18&page=1&sort=fare:asc
// Proxies to Vgate API - requires VEXERE_USERNAME + VEXERE_PASSWORD
router.get('/trips', async (req, res) => {
    if (!isVexereConfigured()) {
        res.status(503).json({
            error: 'Vexere API not configured. Set VEXERE_USERNAME and VEXERE_PASSWORD.',
        });
        return;
    }

    const {
        from,
        to,
        date,
        page = '1',
        pagesize = '20',
        sort = 'fare:asc',
    } = req.query as Record<string, string>;

    if (!from || !to || !date) {
        res.status(400).json({ error: 'from, to, and date (YYYY-MM-DD) are required' });
        return;
    }

    try {
        const result = await searchTrips({
            fromProvince: from,
            toProvince: to,
            date,
            page: Number(page),
            pageSize: Number(pagesize),
            sortBy: sort,
        });
        res.json(result);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        res.status(502).json({ error: msg });
    }
});

export default router;
