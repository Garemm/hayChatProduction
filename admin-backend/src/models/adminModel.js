// ── Admin Model ──────────────────────────────────────────────────────────────
import db from '../config/database.js';

const AdminModel = {
  /**
   * Looks up an admin by username returning the hashed password field.
   * Used by authService for bcrypt comparison.
   */
  async findByUsernameForAuth(username) {
    const { rows } = await db.query(
      `SELECT a.id, a.username, a.password, a.business_id,
              b.is_active,
              pt.dashboard, pt.pedidos, pt.productos, pt.categorias,
              pt.importar_productos, pt.servicios, pt.promociones, pt.horarios,
              pt.mi_haychat, pt.mi_negocio, pt.mi_webpage, pt.suscripciones
       FROM admins a
       JOIN businesses b ON b.id = a.business_id
       LEFT JOIN subscriptions s ON s.id = b.subscription_id
       LEFT JOIN permissions_types pt ON pt.id = s.tipo_permiso
       WHERE a.username = $1`,
      [username]
    );
    return rows[0] || null;
  },

  /**
   * Looks up an admin by username (for uniqueness check during registration).
   */
  async findByUsername(username) {
    const { rows } = await db.query(
      `SELECT id FROM admins WHERE username = $1`,
      [username]
    );
    return rows[0] || null;
  },

  async findByBusinessId(business_id) {
    const { rows } = await db.query(
      `SELECT id, username, password, business_id
       FROM admins
       WHERE business_id = $1
       LIMIT 1`,
      [business_id]
    );
    return rows[0] || null;
  },

  /**
   * Inserts a new admin row with a hashed password.
   * Returns the created { id, username, business_id }.
   */
  async create({ username, password, business_id }) {
    const { rows } = await db.query(
      `INSERT INTO admins (username, password, business_id)
       VALUES ($1, $2, $3)
       RETURNING id, username, business_id`,
      [username, password, business_id]
    );
    return rows[0];
  },

  // ── Password reset tokens ─────────────────────────────────────────────────

  async createResetToken({ admin_id, token_hash, expires_at }) {
    await db.query(
      `INSERT INTO password_resets (admin_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [admin_id, token_hash, expires_at]
    );
  },

  async findValidResetToken(token_hash) {
    const { rows } = await db.query(
      `SELECT id, admin_id
       FROM password_resets
       WHERE token_hash = $1
         AND expires_at > now()
         AND used = false`,
      [token_hash]
    );
    return rows[0] || null;
  },

  async markResetTokenUsed(id) {
    await db.query(
      `UPDATE password_resets SET used = true WHERE id = $1`,
      [id]
    );
  },

  async updatePassword(admin_id, hashed_password) {
    await db.query(
      `UPDATE admins SET password = $1 WHERE id = $2`,
      [hashed_password, admin_id]
    );
  },

  // ── JWT refresh token management ──────────────────────────────────────────

  /**
   * Returns admin row including refresh_token_hash — used during token refresh.
   */
  async findById(adminId) {
    const { rows } = await db.query(
      `SELECT a.id, a.username, a.business_id, a.refresh_token_hash,
              b.is_active,
              pt.dashboard, pt.pedidos, pt.productos, pt.categorias,
              pt.importar_productos, pt.servicios, pt.promociones, pt.horarios,
              pt.mi_haychat, pt.mi_negocio, pt.mi_webpage, pt.suscripciones
       FROM admins a
       JOIN businesses b ON b.id = a.business_id
       LEFT JOIN subscriptions s ON s.id = b.subscription_id
       LEFT JOIN permissions_types pt ON pt.id = s.tipo_permiso
       WHERE a.id = $1`,
      [adminId]
    );
    return rows[0] || null;
  },

  /**
   * Stores (or replaces) the SHA-256 hash of the refresh token for the given admin.
   * This enables single-use refresh tokens — rotating on every refresh.
   */
  async saveRefreshTokenHash(adminId, tokenHash) {
    await db.query(
      `UPDATE admins SET refresh_token_hash = $1 WHERE id = $2`,
      [tokenHash, adminId]
    );
  },

  /**
   * Nullifies the stored refresh token hash, effectively invalidating all
   * existing refresh tokens for that admin (logout / password change).
   */
  async clearRefreshToken(adminId) {
    await db.query(
      `UPDATE admins SET refresh_token_hash = NULL WHERE id = $1`,
      [adminId]
    );
  },

  /**
   * Idempotent schema migration — adds refresh_token_hash column if it does not
   * exist yet. Called once at server startup (see server.js).
   */
  async ensureMigrations() {
    await db.query(`
      ALTER TABLE admins
      ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(255)
    `);
  },
};

export default AdminModel;
