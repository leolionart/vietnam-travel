import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// In-memory JTI blocklist (for logout)
const blockedJtis = new Set<string>();

export function blockJti(jti: string): void {
    blockedJtis.add(jti);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const adminPassword = req.headers['x-admin-password'];
    if (typeof adminPassword === 'string' && adminPassword === ADMIN_PASSWORD) {
        next();
        return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing authorization header or x-admin-password' });
        return;
    }

    const token = authHeader.slice(7);
    try {
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        if (payload.jti && blockedJtis.has(payload.jti)) {
            res.status(401).json({ error: 'Token has been revoked' });
            return;
        }

        (req as Request & { jwtPayload: typeof payload }).jwtPayload = payload;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
