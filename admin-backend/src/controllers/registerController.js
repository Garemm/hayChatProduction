// ── Register Controller ───────────────────────────────────────────────────────
import bcrypt from 'bcrypt';
import BusinessModel from '../models/businessModel.js';
import AdminModel from '../models/adminModel.js';

const SALT_ROUNDS = 12;

const register = async (req, res, next) => {
  try {
    const {
      name, category, description, city, email, phone, webpage_link,
      username, password, confirmPassword,
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    const required = { name, category, city, email, username, password, confirmPassword };
    const missing  = Object.entries(required)
      .filter(([, v]) => !v || !String(v).trim())
      .map(([k]) => k);

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Campos requeridos faltantes: ${missing.join(', ')}`,
      });
    }

    // ── Validate category (must be a positive integer FK to business_types) ────────
    const categoryId = parseInt(category, 10);
    if (!categoryId || categoryId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Categoría inválida',
      });
    }

    // ── Validate email format ─────────────────────────────────────────────────
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return res.status(400).json({ success: false, message: 'Formato de email inválido' });
    }

    // ── Validate password match ───────────────────────────────────────────────
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Las contraseñas no coinciden' });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    // ── Check username uniqueness ─────────────────────────────────────────────
    const existing = await AdminModel.findByUsername(username.trim());
    if (existing) {
      return res.status(409).json({ success: false, message: 'El username ya está en uso' });
    }

    // ── Create business ───────────────────────────────────────────────────────
    const business = await BusinessModel.create({
      name:         name.trim(),
      category:     categoryId,
      description:  description?.trim() || null,
      city:         city.trim(),
      email:        email.trim().toLowerCase(),
      phone:        phone?.trim() || null,
      webpage_link: webpage_link?.trim() || null,
    });

    // ── Hash password & create admin ──────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await AdminModel.create({
      username:    username.trim(),
      password:    hashedPassword,
      business_id: business.id,
    });

    return res.status(201).json({
      success: true,
      message: 'Cuenta creada correctamente',
    });
  } catch (err) {
    next(err);
  }
};

export { register };

const checkUsername = async (req, res, next) => {
  try {
    const username = String(req.query.username || '').trim();
    if (!username) return res.status(400).json({ success: false, message: 'username requerido' });

    const existing = await AdminModel.findByUsername(username);
    return res.json({ success: true, data: { available: !existing } });
  } catch (err) {
    next(err);
  }
};

export { checkUsername };
