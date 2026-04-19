// ── BusinessType Controller ───────────────────────────────────────────────────
import BusinessTypeModel from '../models/businessTypeModel.js';

// GET /admin/business-types  (public — used by Register page)
const list = async (req, res, next) => {
  try {
    const types = await BusinessTypeModel.findAll();
    res.json({ success: true, data: types });
  } catch (err) { next(err); }
};

export { list };
