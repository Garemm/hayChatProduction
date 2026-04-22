// ── Admin Backend — Entry Point ────────────────────────────────────────────
// Starts the Express server. All route/middleware wiring lives in src/app.js.
import dotenv from 'dotenv';
dotenv.config({ path: './.env' }); // Ajusta la ruta si tu .env está en otro lugar
console.log('[DEBUG] .env loaded:', {
  DB_HOST: process.env.DB_HOST,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET
});
import http from 'http';
import { Server } from 'socket.io';
import app from './src/app.js';
import AdminModel from './src/models/adminModel.js';
import BusinessModel from './src/models/businessModel.js';
import cron from 'node-cron';
import db from './src/config/database.js';

const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5174')
  .split(',')
  .map((u) => u.trim());

// ── HTTP server + Socket.io ───────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

// ── Socket.io: rooms are keyed by business_id internally.
// Clients only know the public chat_uuid and join via that.
io.on('connection', (socket) => {
  // Client emits: { chat_uuid: '<uuid>' }
  socket.on('join-chat', async ({ chat_uuid } = {}) => {
    if (!chat_uuid) return socket.emit('chat-error', { error: 'chat_uuid requerido' });

    const biz = await BusinessModel.findByChatUuid(chat_uuid).catch(() => null);
    if (!biz) return socket.emit('chat-error', { error: 'Negocio no encontrado' });

    const room = `business_${biz.id}`;
    socket.join(room);
    socket.emit('chat-joined', { business_id: biz.id, room, name: biz.name });
  });

  socket.on('chat-message', async ({ chat_uuid, message } = {}) => {
    if (!chat_uuid || !message) return;
    const biz = await BusinessModel.findByChatUuid(chat_uuid).catch(() => null);
    if (!biz) return socket.emit('chat-error', { error: 'Negocio no encontrado' });

    const room = `business_${biz.id}`;
    io.to(room).emit('chat-message', { from: socket.id, message, business_id: biz.id });
  });
});

// Expose io for use in controllers if needed
app.set('io', io);

// ── Weekly analytics reset (every Sunday at midnight) ─────────────────────────
// Deletes all product_query_logs so the dashboard shows fresh weekly data.
cron.schedule('0 0 * * 0', async () => {
  try {
    await db.query('DELETE FROM product_query_logs');
    console.log('[Cron] product_query_logs table reset (weekly)');
  } catch (err) {
    console.error('[Cron] Error resetting product_query_logs:', err.message);
  }
}, { timezone: 'America/Mexico_City' });

// Run idempotent DB migrations before accepting connections
AdminModel.ensureMigrations()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`🛠  Admin API ready on http://localhost:${PORT}  [${process.env.NODE_ENV || 'development'}]`);
    });
  })
  .catch((err) => {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  });
