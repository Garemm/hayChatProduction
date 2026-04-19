// ── BusinessType Model ────────────────────────────────────────────────────────
import db from '../config/database.js';

const BusinessTypeModel = {
  async findAll() {
    const { rows } = await db.query(
      `SELECT id, name FROM business_types ORDER BY id`
    );
    return rows;
  },
};

export default BusinessTypeModel;
