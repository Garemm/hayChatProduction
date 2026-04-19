// ── Category Model ──────────────────────────────────────────────────────────
import db from '../config/database.js';

const CategoryModel = {
  async findByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT id, name, parent_id FROM categories
       WHERE business_id = $1
       ORDER BY name ASC`,
      [businessId]
    );
    return rows;
  },

  // ── Find a single category by name (case-insensitive) ─────────────────────
  async findByName(businessId, name) {
    const { rows } = await db.query(
      `SELECT id, name FROM categories
       WHERE business_id = $1 AND lower(name) = lower($2)
       LIMIT 1`,
      [businessId, name]
    );
    return rows[0] || null;
  },

  // ── Create a category (optional parent_id) ────────────────────────────────
  async create(businessId, name, parentId = null) {
    const { rows: [cat] } = await db.query(
      `INSERT INTO categories (name, business_id, parent_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_id`,
      [name, businessId, parentId ?? null]
    );
    return cat;
  },

  // ── Update name / parent of a category ────────────────────────────────────
  async update(id, businessId, name, parentId = null) {
    const { rows: [cat] } = await db.query(
      `UPDATE categories
       SET name = $1, parent_id = $2
       WHERE id = $3 AND business_id = $4
       RETURNING id, name, parent_id`,
      [name, parentId ?? null, id, businessId]
    );
    return cat || null;
  },

  // ── Delete a category (products get category_id = NULL via ON DELETE SET NULL) ──
  async delete(id, businessId) {
    const { rowCount } = await db.query(
      `DELETE FROM categories WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return rowCount > 0;
  },

  // ── Create multiple categories atomically, skip names that already exist ──
  async createMany(businessId, names) {
    if (!names || names.length === 0) return [];
    const client = await db.connect();
    const created = [];
    try {
      await client.query('BEGIN');
      for (const name of names) {
        // Only insert if it doesn't already exist
        const { rows } = await client.query(
          `INSERT INTO categories (name, business_id)
           SELECT $1::text, $2::int
           WHERE NOT EXISTS (
             SELECT 1 FROM categories WHERE business_id = $2::int AND lower(name) = lower($1::text)
           )
           RETURNING id, name`,
          [name, businessId]
        );
        if (rows[0]) created.push(rows[0]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return created;
  },
};

export default CategoryModel;
