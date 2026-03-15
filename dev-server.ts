import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import {createServer as createViteServer} from 'vite';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json({limit: '2mb'}));

app.put('/api/plans', async (req, res) => {
  try {
    const plansPath = path.resolve(__dirname, 'plans.json');
    await fs.writeFile(plansPath, JSON.stringify(req.body, null, 4) + '\n', 'utf-8');
    res.json({ok: true});
  } catch (error) {
    console.error('Save plans failed:', error);
    res.status(500).json({ok: false, message: 'Không thể ghi plans.json'});
  }
});

async function start() {
  const vite = await createViteServer({
    server: {middlewareMode: true},
    appType: 'spa',
  });

  app.use(vite.middlewares);

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Dev server running at http://localhost:${port}`);
  });
}

start();
