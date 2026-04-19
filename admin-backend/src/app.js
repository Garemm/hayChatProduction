// ── Admin Backend — Express App ─────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import router from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

// Fix __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CORS ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:4000')
  .split(',')
  .map((u) => u.trim());

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/panel', router); //panel es nombre de api y debe coincidir con el proxy del frontend (vite.config.js)

// ── Static Frontend (SOLO si está activado) ─────────────────────────────────
if (process.env.SERVE_FRONTEND === 'true') {
  const publicPath = path.join(__dirname, '../public/panelFrontend');

  app.use('/panelAdministrador', express.static(publicPath));

  app.get('/panelAdministrador/*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

    app.get('/', (req, res) => {
    res.redirect('/panelAdministrador'); 
  });
}

// ── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
