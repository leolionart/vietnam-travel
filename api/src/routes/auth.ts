import { Router } from 'express';
import { SignJWT } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { blockJti, requireAuth } from '../middleware/auth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

router.post('/login', async (req, res) => {
    const { password } = req.body as { password?: string };
    if (!password || password !== ADMIN_PASSWORD) {
        res.status(401).json({ error: 'Invalid password' });
        return;
    }

    const jti = uuidv4();
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({ sub: 'admin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secret);

    res.json({ token });
});

router.post('/logout', requireAuth, (req, res) => {
    const payload = (req as typeof req & { jwtPayload: { jti?: string } }).jwtPayload;
    if (payload?.jti) blockJti(payload.jti);
    res.json({ ok: true });
});

export default router;
