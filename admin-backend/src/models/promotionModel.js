// ── Promotion Model ──────────────────────────────────────────────────────────
import db from '../config/database.js';

const PromotionModel = {
  async findAllByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT id, title, description, discount_type, discount_value, start_date, end_date
       FROM promotions
       WHERE business_id = $1
       ORDER BY start_date DESC`,
      [businessId]
    );
    return rows;
  },

  async findById(id, businessId) {
    const { rows } = await db.query(
      `SELECT id, title, description, discount_type, discount_value, start_date, end_date
       FROM promotions
       WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return rows[0] || null;
  },

  async create(businessId, { title, description, discount_type, discount_value, start_date, end_date }) {
    const { rows } = await db.query(
      `INSERT INTO promotions (business_id, title, description, discount_type, discount_value, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, title, description, discount_type, discount_value, start_date, end_date`,
      [businessId, title, description || null, discount_type, discount_value, start_date, end_date]
    );
    return rows[0];
  },

  async update(id, businessId, { title, description, discount_type, discount_value, start_date, end_date }) {
    const { rows } = await db.query(
      `UPDATE promotions
       SET title=$1, description=$2, discount_type=$3, discount_value=$4, start_date=$5, end_date=$6
       WHERE id=$7 AND business_id=$8
       RETURNING id, title, description, discount_type, discount_value, start_date, end_date`,
      [title, description || null, discount_type, discount_value, start_date, end_date, id, businessId]
    );
    return rows[0] || null;
  },

  async delete(id, businessId) {
    const { rowCount } = await db.query(
      `DELETE FROM promotions WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return rowCount > 0;
  },

  async countByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM promotions WHERE business_id = $1`,
      [businessId]
    );
    return rows[0].total;
  },
};

export default PromotionModel;
