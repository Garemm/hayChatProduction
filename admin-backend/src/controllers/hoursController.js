// ── Hours Controller ──────────────────────────────────────────────────────────
import HoursModel from '../models/hoursModel.js';

const list = async (req, res, next) => {
  try {
    const hours = await HoursModel.findByBusiness(req.businessId);
    res.json({ success: true, data: hours });
  } catch (err) { next(err); }
};

// Upsert one day (POST /hours)
const upsertOne = async (req, res, next) => {
  try {
    const row = await HoursModel.upsert(req.businessId, req.body);
    // Sync acepto_pedidos based on current time vs updated schedule
    await HoursModel.syncAceptaPedidos(req.businessId);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

// Bulk upsert all days (POST /hours/bulk)
const bulkSave = async (req, res, next) => {
  try {
    const { days } = req.body;
    if (!Array.isArray(days)) {
      return res.status(400).json({ success: false, error: 'days debe ser un arreglo' });
    }
    const result = await HoursModel.bulkUpsert(req.businessId, days);
    // Sync acepto_pedidos based on current time vs updated schedule
    await HoursModel.syncAceptaPedidos(req.businessId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await HoursModel.remove(parseInt(req.params.id, 10), req.businessId);
    if (!deleted) return res.status(404).json({ success: false, error: 'No encontrado' });
    // Re-sync after removing a day's hours
    await HoursModel.syncAceptaPedidos(req.businessId);
    res.json({ success: true });
  } catch (err) { next(err); }
};

export { list, upsertOne, bulkSave, remove };
