// ── Promotion Controller ──────────────────────────────────────────────────────
import PromotionModel from '../models/promotionModel.js';

const list = async (req, res, next) => {
  try {
    const promotions = await PromotionModel.findAllByBusiness(req.businessId);
    res.json({ success: true, data: promotions });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const promo = await PromotionModel.findById(parseInt(req.params.id, 10), req.businessId);
    if (!promo) return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
    res.json({ success: true, data: promo });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const promo = await PromotionModel.create(req.businessId, req.body);
    res.status(201).json({ success: true, data: promo });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const promo = await PromotionModel.update(parseInt(req.params.id, 10), req.businessId, req.body);
    if (!promo) return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
    res.json({ success: true, data: promo });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await PromotionModel.delete(parseInt(req.params.id, 10), req.businessId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
    res.json({ success: true });
  } catch (err) { next(err); }
};

export { list, getById, create, update, remove };
