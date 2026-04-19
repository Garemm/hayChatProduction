// ── Business Controller ──────────────────────────────────────────────────────
import BusinessModel from '../models/businessModel.js';
import ProductModel from '../models/productModel.js';
import ServiceModel from '../models/serviceModel.js';
import PromotionModel from '../models/promotionModel.js';

const getStats = async (req, res, next) => {
  try {
    const biz = await BusinessModel.findById(req.businessId);
    const [products, services, promotions] = await Promise.all([
      ProductModel.countByBusiness(req.businessId),
      ServiceModel.countByBusiness(req.businessId),
      PromotionModel.countByBusiness(req.businessId),
    ]);
    res.json({ success: true, data: { business: biz, stats: { products, services, promotions } } });
  } catch (err) { next(err); }
};

const getInfo = async (req, res, next) => {
  try {
    const biz = await BusinessModel.findById(req.businessId);
    if (!biz) return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    res.json({ success: true, data: biz });
  } catch (err) { next(err); }
};

const updateInfo = async (req, res, next) => {
  try {
    const updated = await BusinessModel.update(req.businessId, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

export { getStats, getInfo, updateInfo };
