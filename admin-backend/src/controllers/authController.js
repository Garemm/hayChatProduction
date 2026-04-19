// ── Auth Controller ──────────────────────────────────────────────────────────
import crypto from 'crypto';
import * as authService from '../services/authService.js';
import * as emailService from '../services/emailService.js';
import BusinessModel from '../models/businessModel.js';
import AdminModel from '../models/adminModel.js';
import * as jwtUtils from '../config/jwt.js';

/** SHA-256 hash of a refresh token for safe DB storage. */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
    }
    const admin = await authService.login(username, password);

    const payload      = { adminId: admin.id, businessId: admin.business_id };
    const accessToken  = jwtUtils.signAccess(payload);
    const refreshToken = jwtUtils.signRefresh(payload);

    // Persist hash so the refresh token can be revoked
    await AdminModel.saveRefreshTokenHash(admin.id, hashToken(refreshToken));

    // Deliver refresh token via HTTP-only cookie (not accessible from JS)
    res.cookie('rt', refreshToken, jwtUtils.REFRESH_COOKIE_OPTS);

    res.json({
      success: true,
      accessToken,
      businessId:  admin.business_id,
      permissions: admin.permissions,
      isActive:    admin.is_active ?? false,
    });
  } catch (err) {
    if (err.message === 'Credenciales incorrectas') {
      return res.status(401).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * POST /admin/forgot-password  { email }
 * Always returns 200 to avoid user enumeration.
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'El correo es requerido' });
    }

    // Look up the business + admin by email (best-effort, no enumeration leak)
    const record = await BusinessModel.findAdminByBusinessEmail(email);
    if (record) {
      const rawToken = await authService.createResetToken(record.admin_id);
      await emailService.sendPasswordReset(email, rawToken, record.business_name);
    }else{
      // Optional: log the attempt for monitoring (but never the email)
      console.warn(`Requisición de restablecimiento de contraseña para un correo no registrado: ${email}`);
    }

    // Always respond the same way
    res.json({
      success: true,
      message: 'Si el correo está registrado recibirás un enlace en los próximos minutos.',
    });
  } catch (err) { next(err); }
};

/**
 * POST /admin/reset-password  { token, password, confirmPassword }
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;
    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Las contraseñas no coinciden' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    await authService.resetPassword(token, password);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    if (err.message === 'El enlace es inválido o ha expirado') {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * PUT /admin/change-password  { currentPassword, newPassword, confirmPassword }
 * Requires auth (x-business-id).
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Las contraseñas no coinciden' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    await authService.changePassword(req.businessId, currentPassword, newPassword);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    if (err.message === 'La contraseña actual es incorrecta') {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * POST /admin/refresh  (public — no Bearer token needed)
 * Reads the HTTP-only `rt` cookie, verifies it against the DB hash,
 * rotates the refresh token, and returns a new short-lived access token.
 */
const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.rt;
    if (!token) {
      return res.status(401).json({ success: false, error: 'No autorizado' });
    }

    let payload;
    try {
      payload = jwtUtils.verifyRefresh(token);
    } catch {
      res.clearCookie('rt', { ...jwtUtils.REFRESH_COOKIE_OPTS, maxAge: 0 });
      return res.status(401).json({ success: false, error: 'Sesión expirada' });
    }

    const admin = await AdminModel.findById(payload.adminId);
    if (!admin || admin.refresh_token_hash !== hashToken(token)) {
      // Token not in DB (revoked or forged) — clear cookie
      res.clearCookie('rt', { ...jwtUtils.REFRESH_COOKIE_OPTS, maxAge: 0 });
      return res.status(401).json({ success: false, error: 'Sesión inválida' });
    }

    // Rotate: generate new refresh + access tokens
    const tokenPayload  = { adminId: admin.id, businessId: admin.business_id };
    const newRefresh    = jwtUtils.signRefresh(tokenPayload);
    const newAccess     = jwtUtils.signAccess(tokenPayload);

    await AdminModel.saveRefreshTokenHash(admin.id, hashToken(newRefresh));
    res.cookie('rt', newRefresh, jwtUtils.REFRESH_COOKIE_OPTS);

    res.json({
      success: true,
      accessToken: newAccess,
      businessId:  admin.business_id,
      permissions: authService.buildPermissions(admin),
      isActive:    admin.is_active ?? false,
    });
  } catch (err) { next(err); }
};

/**
 * POST /admin/logout  (public — accepts expired access tokens)
 * Revokes the refresh token in DB and clears the cookie.
 */
const logout = async (req, res, next) => {
  try {
    const token = req.cookies?.rt;
    if (token) {
      try {
        const payload = jwtUtils.verifyRefresh(token);
        await AdminModel.clearRefreshToken(payload.adminId);
      } catch { /* expired / invalid token — only clear cookie */ }
    }
    res.clearCookie('rt', { ...jwtUtils.REFRESH_COOKIE_OPTS, maxAge: 0 });
    res.json({ success: true });
  } catch (err) { next(err); }
};

export { login, forgotPassword, resetPassword, changePassword, refreshToken, logout };

