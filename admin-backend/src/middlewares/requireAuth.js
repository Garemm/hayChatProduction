// ── Auth middleware (JWT) ────────────────────────────────────────────────────────
// Reads and verifies the short-lived JWT from the Authorization: Bearer header.
// Sets req.adminId and req.businessId for downstream handlers.
import { verifyAccess } from '../config/jwt.js';

const requireAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const payload  = verifyAccess(auth.slice(7));
    req.adminId    = payload.adminId;
    req.businessId = payload.businessId;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }
};

export default requireAuth;
