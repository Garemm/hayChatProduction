// ── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const status  = err.status || 500;
  const message = err.message || 'Internal Server Error';
  console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${message}`);
  res.status(status).json({ success: false, error: message });
};

export default errorHandler;
