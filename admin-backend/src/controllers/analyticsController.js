/**
 * analyticsController.js
 *
 * GET /analytics/top-products/:business_id
 *   Top 10 products by COUNT(*) of individual log records.
 *
 * GET /analytics/traffic-by-hour/:business_id
 *   Query volume grouped by hour of day (0–23), COUNT(*) of individual
 *   log records.  Returns all 24 slots (0 for hours with no data).
 *
 * Security: multi-tenant guard — admin may only query their own business_id.
 * No server-side cache — queries run directly against the indexed table so
 * the frontend 10-second poll always returns fresh data.
 */

import db from '../config/database.js';

// ── Tenant guard helper ────────────────────────────────────────────────────────
function _guardTenant(req, res) {
  const requestedId = parseInt(req.params.business_id, 10);
  if (!req.businessId || req.businessId !== requestedId) {
    res.status(403).json({ error: 'Acceso denegado' });
    return null;
  }
  return requestedId;
}

// ── GET /analytics/top-products/:business_id ──────────────────────────────────
// Top 10 products ordered by number of individual log records (COUNT(*)).
// Response: { data: [{ product_id, name, count }] }
export const getTopProducts = async (req, res) => {
  const businessId = _guardTenant(req, res);
  if (businessId === null) return;

  try {
    const { rows } = await db.query(
      `SELECT
         pql.product_id,
         p.name,
         COUNT(*) AS count
       FROM product_query_logs pql
       JOIN products p ON p.id = pql.product_id
       WHERE pql.business_id = $1
       GROUP BY pql.product_id, p.name
       ORDER BY count DESC
       LIMIT 10`,
      [businessId]
    );

    const data = rows.map((r) => ({
      product_id: r.product_id,
      name:       r.name,
      count:      parseInt(r.count, 10),
    }));

    return res.json({ data });
  } catch (err) {
    console.error('[Analytics] getTopProducts error:', err.message);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// ── GET /analytics/traffic-by-hour/:business_id ───────────────────────────────
// Counts log records grouped by hour of day (0–23) using created_at.
// Always returns all 24 hours; hours with no data have count = 0.
// Response: { data: [{ hour, count }] }   (24 entries, sorted by hour asc)
export const getTrafficByHour = async (req, res) => {
  const businessId = _guardTenant(req, res);
  if (businessId === null) return;

  try {
    const { rows } = await db.query(
      `SELECT
         EXTRACT(HOUR FROM created_at)::int AS hour,
         COUNT(*) AS count
       FROM product_query_logs
       WHERE business_id = $1
       GROUP BY hour
       ORDER BY hour`,
      [businessId]
    );

    // Fill in all 24 slots so the chart always renders a complete axis
    const byHour = new Map(rows.map((r) => [r.hour, parseInt(r.count, 10)]));
    const data = Array.from({ length: 24 }, (_, h) => ({
      hour:  h,
      count: byHour.get(h) ?? 0,
    }));

    return res.json({ data });
  } catch (err) {
    console.error('[Analytics] getTrafficByHour error:', err.message);
    return res.status(500).json({ error: 'Error al obtener estadísticas de tráfico' });
  }
};
