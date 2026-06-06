import { Router } from 'express';

const router = Router();

function clean(value: unknown): string {
    return String(value ?? '').trim();
}

router.get('/thumbnail', async (req, res) => {
    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_STATIC_MAPS_API_KEY;
    if (!key) {
        res.status(404).json({ error: 'Google Maps thumbnail is not configured' });
        return;
    }

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const size = clean(req.query.size) || '900x520';
    const zoom = clean(req.query.zoom) || '15';
    const query = [
        clean(req.query.address),
        clean(req.query.name),
        clean(req.query.location),
        'Vietnam',
    ].filter(Boolean).join(' ');

    const target = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
        ? `${lat},${lng}`
        : query;

    if (!target) {
        res.status(400).json({ error: 'Missing map thumbnail target' });
        return;
    }

    const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
    url.searchParams.set('center', target);
    url.searchParams.set('zoom', zoom);
    url.searchParams.set('size', size);
    url.searchParams.set('scale', '2');
    url.searchParams.set('maptype', 'roadmap');
    url.searchParams.set('markers', `color:red|${target}`);
    url.searchParams.set('key', key);

    try {
        const upstream = await fetch(url);
        if (!upstream.ok) {
            res.status(upstream.status).json({ error: 'Google Maps thumbnail failed' });
            return;
        }
        const contentType = upstream.headers.get('content-type') || 'image/png';
        const bytes = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Type', contentType);
        res.send(bytes);
    } catch (error) {
        res.status(502).json({ error: 'Google Maps thumbnail unavailable' });
    }
});

export default router;
