// ── JWT helpers ───────────────────────────────────────────────────────────────
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, '../../.env')
});

import jwt from 'jsonwebtoken';

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// ...resto igual

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.error(
    '\n❌  [JWT] JWT_SECRET y JWT_REFRESH_SECRET son obligatorios en .env\n' +
    '   Genera valores seguros con:\n' +
    '   node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n'
  );
  process.exit(1);
}

const ACCESS_TTL  = '9m';   // access token vive 9 minutos
const REFRESH_TTL = '1d';    // refresh token vive 1 día obligando al usuario a iniciar sesión

/**
 * Firma un access token JWT de corta duración.
 * @param {{ adminId: number, businessId: number }} payload
 */
const signAccess = (payload) =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });

/**
 * Firma un refresh token JWT de larga duración.
 * @param {{ adminId: number, businessId: number }} payload
 */
const signRefresh = (payload) =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });

/** Verifica y decodifica un access token. Lanza JsonWebTokenError si inválido. */
const verifyAccess  = (token) => jwt.verify(token, ACCESS_SECRET);

/** Verifica y decodifica un refresh token. Lanza JsonWebTokenError si inválido. */
const verifyRefresh = (token) => jwt.verify(token, REFRESH_SECRET);

/**
 * Opciones para la cookie HTTP-only que transporta el refresh token.
 * - httpOnly  → inaccesible desde JS (protege contra XSS)
 * - secure    → solo HTTPS en producción
 * - sameSite  → protege contra CSRF
 * - path      → solo se envía a rutas /admin
 */
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 días en ms
  path:     '/admin',
};

export {
  signAccess,
  signRefresh,
  verifyAccess,
  verifyRefresh,
  REFRESH_COOKIE_OPTS,
};
