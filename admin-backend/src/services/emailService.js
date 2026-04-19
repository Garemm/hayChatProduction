// ── Email Service ─────────────────────────────────────────────────────────────
// Requires env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, CLIENT_URL
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

function extractEmailAddress(value) {
  if (!value) return '';
  const match = String(value).match(/<([^>]+)>/);
  return (match ? match[1] : String(value)).trim();
}

function getSenderConfig() {
  const smtpUser = extractEmailAddress(process.env.SMTP_USER);
  const configuredFrom = process.env.SMTP_FROM?.trim();

  // Most SMTP providers only allow sending from the authenticated mailbox (or validated aliases).
  const from = configuredFrom || (smtpUser ? `"hayChat Admin Panel" <${smtpUser}>` : '');
  const envelopeFrom = extractEmailAddress(from) || smtpUser;

  if (!envelopeFrom) {
    throw new Error('SMTP sender is not configured. Define SMTP_USER (and optionally SMTP_FROM).');
  }

  return { from, envelopeFrom };
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Sends a password-reset email with a single-use link.
 * @param {string} toEmail        - Recipient email address
 * @param {string} rawToken       - Plain-text reset token (never log/store this)
 * @param {string} businessName   - Used to personalise the email
 */
async function sendPasswordReset(toEmail, rawToken, businessName) {
  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;
  const { from, envelopeFrom } = getSenderConfig();

  await transporter.sendMail({
    from,
    sender: envelopeFrom,
    envelope: {
      from: envelopeFrom,
      to: toEmail,
    },
    to: toEmail,
    subject: 'Restablece tu contraseña — hayChat Admin Panel',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a2e">Restablecer contraseña</h2>
        <p>Hola${businessName ? ` <strong>${businessName}</strong>` : ''},</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de administrador.</p>
        <p>Haz clic en el botón de abajo para continuar. El enlace expira en <strong>1 hora</strong>.</p>
        <a href="${resetLink}"
           style="display:inline-block;margin:16px 0;padding:12px 24px;background:#4f46e5;
                  color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Restablecer contraseña
        </a>
        <p style="color:#666;font-size:13px">
          Si no solicitaste este cambio, puedes ignorar este correo con seguridad.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#999;font-size:12px">Admin Panel — acceso interno</p>
      </div>
    `,
  });
}

export { sendPasswordReset };
