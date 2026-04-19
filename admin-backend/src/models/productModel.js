// ── Product Model ────────────────────────────────────────────────────────────
// Handles products, product_inventory, and product_attributes together.
import db from '../config/database.js';

const ProductModel = {
  // ── Count products for a business ─────────────────────────────────────────
  async countByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM products WHERE business_id = $1`,
      [businessId]
    );
    return rows[0].count;
  },

  // ── Get max_products limit from the active subscription ───────────────────
  // Returns null when no subscription is assigned or when max_products is NULL
  // (meaning unlimited).
  async getSubscriptionLimit(businessId) {
    const { rows } = await db.query(
      `SELECT s.max_products
       FROM businesses b
       LEFT JOIN subscriptions s ON s.id = b.subscription_id
       WHERE b.id = $1`,
      [businessId]
    );
    return rows[0]?.max_products ?? null;
  },

  // ── Find by item_code_empresa (for duplicate-key error messages) ──────────
  async findByItemCode(businessId, itemCode) {
    const { rows } = await db.query(
      `SELECT id, name FROM products WHERE business_id = $1 AND item_code_empresa = $2 LIMIT 1`,
      [businessId, itemCode]
    );
    return rows[0] || null;
  },

  // ── List all products for a business, join inventory ──────────────────────
  async findAllByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.description, p.price, p.category_id,
              p.is_available, p.created_at, p.item_code_empresa,
              c.name AS category_name,
              COALESCE(pi.stock_quantity, 0) AS stock_quantity
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_inventory pi ON pi.product_id = p.id
       WHERE p.business_id = $1
       ORDER BY p.created_at DESC`,
      [businessId]
    );
    return rows;
  },

  // ── Single product with attributes ────────────────────────────────────────
  async findById(id, businessId) {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.description, p.price, p.category_id,
              p.is_available, p.created_at, p.item_code_empresa,
              COALESCE(pi.stock_quantity, 0) AS stock_quantity
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id
       WHERE p.id = $1 AND p.business_id = $2`,
      [id, businessId]
    );
    if (!rows[0]) return null;

    const { rows: attrs } = await db.query(
      `SELECT id, key, value FROM product_attributes WHERE product_id = $1`,
      [id]
    );
    return { ...rows[0], attributes: attrs };
  },

  // ── Create product + inventory + attributes (one transaction) ─────────────
  async create(businessId, { name, description, price, category_id, is_available, stock_quantity, attributes, item_code_empresa }) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: [product] } = await client.query(
        `INSERT INTO products (business_id, name, description, price, category_id, is_available, item_code_empresa)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, name, description, price, category_id, is_available, created_at, item_code_empresa`,
        [businessId, name, description || null, price, category_id || null, is_available ?? true, item_code_empresa || null]
      );

      await client.query(
        `INSERT INTO product_inventory (product_id, stock_quantity) VALUES ($1, $2)`,
        [product.id, stock_quantity ?? 0]
      );

      const savedAttrs = [];
      for (const { key, value } of (attributes || [])) {
        if (!key || !value) continue;
        const { rows: [attr] } = await client.query(
          `INSERT INTO product_attributes (product_id, key, value) VALUES ($1,$2,$3) RETURNING id, key, value`,
          [product.id, key, value]
        );
        savedAttrs.push(attr);
      }

      await client.query('COMMIT');
      return { ...product, stock_quantity: stock_quantity ?? 0, attributes: savedAttrs };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ── Update product + inventory + replace attributes ────────────────────────
  async update(id, businessId, { name, description, price, category_id, is_available, stock_quantity, attributes, item_code_empresa }) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: [product] } = await client.query(
        `UPDATE products
         SET name=$1, description=$2, price=$3, category_id=$4, is_available=$5, item_code_empresa=$6
         WHERE id=$7 AND business_id=$8
         RETURNING id, name, description, price, category_id, is_available, item_code_empresa`,
        [name, description || null, price, category_id || null, is_available ?? true, item_code_empresa || null, id, businessId]
      );
      if (!product) { await client.query('ROLLBACK'); return null; }

      await client.query(
        `INSERT INTO product_inventory (product_id, stock_quantity)
         VALUES ($1,$2)
         ON CONFLICT (product_id) DO UPDATE SET stock_quantity=$2, updated_at=NOW()`,
        [id, stock_quantity ?? 0]
      );

      // Replace all attributes
      await client.query(`DELETE FROM product_attributes WHERE product_id = $1`, [id]);
      const savedAttrs = [];
      for (const { key, value } of (attributes || [])) {
        if (!key || !value) continue;
        const { rows: [attr] } = await client.query(
          `INSERT INTO product_attributes (product_id, key, value) VALUES ($1,$2,$3) RETURNING id, key, value`,
          [id, key, value]
        );
        savedAttrs.push(attr);
      }

      await client.query('COMMIT');
      return { ...product, stock_quantity: stock_quantity ?? 0, attributes: savedAttrs };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ── Upsert by item_code_empresa (used in bulk import) ────────────────────
  // Returns { product, action: 'inserted' | 'updated' }
  // Pass an existing `txClient` from the caller to run within its transaction.
  async upsertByItemCode(businessId, row, txClient) {
    const {
      item_code_empresa, name, description, price,
      category_id, is_available, stock_quantity, attributes,
    } = row;

    // Use provided transaction client or open a standalone one
    const ownTx = !txClient;
    const client = txClient ?? await db.connect();

    try {
      if (ownTx) await client.query('BEGIN');

      // Check if product exists by item_code_empresa in this business
      const { rows: existing } = await client.query(
        `SELECT id FROM products WHERE business_id = $1 AND item_code_empresa = $2`,
        [businessId, item_code_empresa]
      );

      let product;
      let action;

      if (existing.length > 0) {
        // UPDATE
        const existingId = existing[0].id;
        const { rows: [updated] } = await client.query(
          `UPDATE products
           SET name=$1, description=$2, price=$3, category_id=$4, is_available=$5
           WHERE id=$6 AND business_id=$7
           RETURNING id, name, price, item_code_empresa`,
          [name, description || null, price, category_id || null, is_available ?? true, existingId, businessId]
        );
        product = updated;
        action = 'updated';
      } else {
        // INSERT
        const { rows: [inserted] } = await client.query(
          `INSERT INTO products (business_id, name, description, price, category_id, is_available, item_code_empresa)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, name, price, item_code_empresa`,
          [businessId, name, description || null, price, category_id || null, is_available ?? true, item_code_empresa]
        );
        product = inserted;
        action = 'inserted';
      }

      // Upsert inventory
      await client.query(
        `INSERT INTO product_inventory (product_id, stock_quantity)
         VALUES ($1,$2)
         ON CONFLICT (product_id) DO UPDATE SET stock_quantity=$2, updated_at=NOW()`,
        [product.id, stock_quantity ?? 0]
      );

      // Replace attributes if provided
      if (Array.isArray(attributes) && attributes.length > 0) {
        await client.query(`DELETE FROM product_attributes WHERE product_id = $1`, [product.id]);
        for (const { key, value } of attributes) {
          if (!key || value == null) continue;
          await client.query(
            `INSERT INTO product_attributes (product_id, key, value) VALUES ($1,$2,$3)`,
            [product.id, key, String(value)]
          );
        }
      }

      if (ownTx) await client.query('COMMIT');
      return { product, action };
    } catch (err) {
      if (ownTx) await client.query('ROLLBACK');
      throw err;
    } finally {
      if (ownTx) client.release();
    }
  },

  // ── Delete product (cascades to inventory + attributes via FK) ─────────────
  async delete(id, businessId) {
    const { rowCount } = await db.query(
      `DELETE FROM products WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return rowCount > 0;
  },

  // ── Stats ──────────────────────────────────────────────────────────────────
  async countByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM products WHERE business_id = $1`,
      [businessId]
    );
    return rows[0].total;
  },
};

export default ProductModel;
