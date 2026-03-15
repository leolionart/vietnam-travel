import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// In-memory JTI blocklist (for logout)
const blockedJtis = new Set<string>();

export function blockJti(jti: string): void {
    blockedJtis.add(jti);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing authorization header' });
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
