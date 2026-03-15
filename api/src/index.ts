import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { runMigration } from './db/migrate.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import plansRouter from './routes/plans.js';
import vexereRouter from './routes/vexere.js';
import healthRouter from './routes/health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

runMigration();

const app = express();
app.use(express.json({ limit: '2mb' }));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/plans', plansRouter);
app.use('/api/vexere-link', vexereRouter);
app.use('/api/health', healthRouter);

// Serve static build outputs in production
// In dev, Vite dev servers handle the frontends separately
if (process.env.NODE_ENV === 'production') {
    const staticRoot = join(__dirname, '../static');
    const adminDir = join(staticRoot, 'admin');
    const publicDir = join(staticRoot, 'public');

    // Assets có hash trong tên file (JS/CSS từ Vite) → cache vĩnh viễn
    // HTML entry points → no-cache (phải revalidate sau mỗi deploy)
    const staticOptions = {
        etag: true,
        lastModified: true,
        setHeaders: (res: express.Response, filePath: string) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache');
            } else {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        },
    };

    if (existsSync(adminDir)) {
        app.use('/admin', express.static(adminDir, staticOptions));
        app.get('/admin/*', (_req, res) => {
            res.setHeader('Cache-Control', 'no-cache');
            res.sendFile(join(adminDir, 'index.html'));
        });
    }

    if (existsSync(publicDir)) {
        app.use(express.static(publicDir, staticOptions));
        app.get('*', (_req, res) => {
            res.setHeader('Cache-Control', 'no-cache');
            res.sendFile(join(publicDir, 'index.html'));
        });
    }
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || 7321);
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
