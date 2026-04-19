// ── requireSubscriptionPermission middleware ──────────────────────────────────
// Ensures the authenticated admin belongs to a business that has
// tipo_permiso = 1 (manejo de suscriptores).  Must be placed AFTER requireAuth.
import db from '../config/database.js';

const requireSubscriptionPermission = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT pt.suscripciones
       FROM admins a
       JOIN businesses b ON b.id = a.business_id
       LEFT JOIN subscriptions s ON s.id = b.subscription_id
       LEFT JOIN permissions_types pt ON pt.id = s.tipo_permiso
       WHERE a.id = $1`,
      [req.adminId]
    );

    if (rows[0]?.suscripciones !== true) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para gestionar suscripciones',
      });
    }

    next();
  } catch (err) { next(err); }
};

export default requireSubscriptionPermission;
