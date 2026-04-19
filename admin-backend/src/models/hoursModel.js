// ── Hours Model ──────────────────────────────────────────────────────────────
import db from '../config/database.js';

// Normalize HH:MM:SS → HH:MM for <input type="time">
const t = (v) => (v ? String(v).slice(0, 5) : '');

const HoursModel = {
  async findByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT id, day_of_week, open_time, close_time, is_closed
       FROM business_hours
       WHERE business_id = $1
       ORDER BY day_of_week ASC`,
      [businessId]
    );
    return rows.map((r) => ({ ...r, open_time: t(r.open_time), close_time: t(r.close_time) }));
  },

  // Single upsert by (business_id, day_of_week) — idempotent
  async upsert(businessId, { day_of_week, open_time, close_time, is_closed }) {
    const { rows } = await db.query(
      `INSERT INTO business_hours (business_id, day_of_week, open_time, close_time, is_closed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (business_id, day_of_week)
       DO UPDATE SET open_time = $3, close_time = $4, is_closed = $5
       RETURNING id, day_of_week, open_time, close_time, is_closed`,
      [
        businessId,
        day_of_week,
        open_time  || null,
        close_time || null,
        is_closed  ?? false,
      ]
    );
    const r = rows[0];
    return { ...r, open_time: t(r.open_time), close_time: t(r.close_time) };
  },

  async bulkUpsert(businessId, days) {
    return Promise.all(days.map((d) => this.upsert(businessId, d)));
  },

  async remove(id, businessId) {
    const { rowCount } = await db.query(
      `DELETE FROM business_hours WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return rowCount > 0;
  },

  /**
   * Recomputes acepto_pedidos for a business based on the current time
   * vs. today's saved hours in Mexico City timezone.
   * - is_closed = true for today  → false
   * - No hours row for today      → false
   * - Current time outside window → false
   * - Current time inside window  → true
   */
  async syncAceptaPedidos(businessId) {
    // Resolve current local time in Mexico City
    const now   = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      weekday:  'short',
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    }).formatToParts(now);

    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekdayStr = parts.find((p) => p.type === 'weekday')?.value;
    const dayOfWeek  = weekdayMap[weekdayStr] ?? now.getDay();

    const hourPart   = parts.find((p) => p.type === 'hour')?.value   ?? '00';
    const minutePart = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const currentTime = `${hourPart}:${minutePart}`;

    const { rows } = await db.query(
      `SELECT open_time, close_time, is_closed
       FROM business_hours
       WHERE business_id = $1 AND day_of_week = $2`,
      [businessId, dayOfWeek]
    );

    let isOpen = false;
    if (rows.length > 0) {
      const { open_time, close_time, is_closed } = rows[0];
      if (!is_closed && open_time && close_time) {
        const open  = String(open_time).slice(0, 5);   // 'HH:MM'
        const close = String(close_time).slice(0, 5);
        isOpen = currentTime >= open && currentTime <= close;
      }
    }

    await db.query(
      `UPDATE businesses SET acepto_pedidos = $1 WHERE id = $2`,
      [isOpen, businessId]
    );

    return isOpen;
  },
};

export default HoursModel;
