// ── Auth Service ─────────────────────────────────────────────────────────────
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import AdminModel from '../models/adminModel.js';

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Permission keys — mirror columns in permissions_types table
const PERM_KEYS = [
  'dashboard', 'pedidos', 'productos', 'categorias', 'importar_productos',
  'servicios', 'promociones', 'horarios', 'mi_haychat', 'mi_negocio',
  'mi_webpage', 'suscripciones',
];

/**
 * Builds a { key: bool } permissions object from a DB row joined with
 * permissions_types. Any key that is not strictly TRUE becomes false.
 */
function buildPermissions(row) {
  const perms = {};
  for (const k of PERM_KEYS) perms[k] = row[k] === true;
  return perms;
}

/**
 * Validates username/password using bcrypt.
 * Returns { id, username, business_id } on success, throws on failure.
 */
async function login(username, password) {
  const admin = await AdminModel.findByUsernameForAuth(username);
  if (!admin) throw new Error('Credenciales incorrectas');

  const match = await bcrypt.compare(password, admin.password);
  if (!match) throw new Error('Credenciales incorrectas');

  return {
    id:          admin.id,
    username:    admin.username,
    business_id: admin.business_id,
    permissions: buildPermissions(admin),
    is_active:   admin.is_active ?? false,
  };
}

/**
 * Generates a secure random reset token for the given admin,
 * stores the SHA-256 hash in the DB, and returns the raw token.
 * @param {number} adminId
 * @returns {string} raw token (to send in email link)
 */
async function createResetToken(adminId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  await AdminModel.createResetToken({ admin_id: adminId, token_hash: tokenHash, expires_at: expiresAt });

  return rawToken;
}

/**
 * Validates the raw token, verifies it is unused and not expired,
 * updates the admin's password, and marks the token as used.
 * @param {string} rawToken
 * @param {string} newPassword  (plain text — will be hashed here)
 */
async function resetPassword(rawToken, newPassword) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const record = await AdminModel.findValidResetToken(tokenHash);
  if (!record) throw new Error('El enlace es inválido o ha expirado');

  const hashed = await bcrypt.hash(newPassword, 12);
  await AdminModel.updatePassword(record.admin_id, hashed);
  await AdminModel.markResetTokenUsed(record.id);
}

/**
 * Changes the password for the admin associated with the given businessId.
 * Verifies the current password first.
 */
async function changePassword(businessId, currentPassword, newPassword) {
  const admin = await AdminModel.findByBusinessId(businessId);
  if (!admin) throw new Error('Admin no encontrado');

  const match = await bcrypt.compare(currentPassword, admin.password);
  if (!match) throw new Error('La contraseña actual es incorrecta');

  const hashed = await bcrypt.hash(newPassword, 12);
  await AdminModel.updatePassword(admin.id, hashed);
}

export { login, buildPermissions, createResetToken, resetPassword, changePassword };
