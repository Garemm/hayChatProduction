// ── Service Model ────────────────────────────────────────────────────────────
import db from '../config/database.js';

const ServiceModel = {
  async findAllByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT id, name, description, price
       FROM business_services
       WHERE business_id = $1
       ORDER BY id ASC`,
      [businessId]
    );
    return rows;
  },

  async findById(id, businessId) {
    const { rows } = await db.query(
      `SELECT id, name, description, price
       FROM business_services
       WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return rows[0] || null;
  },

  async create(businessId, { name, description, price }) {
    const { rows } = await db.query(
      `INSERT INTO business_services (business_id, name, description, price)
       VALUES ($1,$2,$3,$4)
       RETURNING id, name, description, price`,
      [businessId, name, description || null, price ?? null]
    );
    return rows[0];
  },

  async update(id, businessId, { name, description, price }) {
    const { rows } = await db.query(
      `UPDATE business_services
       SET name=$1, description=$2, price=$3
       WHERE id=$4 AND business_id=$5
       RETURNING id, name, description, price`,
      [name, description || null, price ?? null, id, businessId]
    );
    return rows[0] || null;
  },

  async delete(id, businessId) {
    const { rowCount } = await db.query(
      `DELETE FROM business_services WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return rowCount > 0;
  },

  async countByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM business_services WHERE business_id = $1`,
      [businessId]
    );
    return rows[0].total;
  },
};

export default ServiceModel;
