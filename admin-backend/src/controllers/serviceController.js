// ── Service Controller ────────────────────────────────────────────────────────
import ServiceModel from '../models/serviceModel.js';

const list = async (req, res, next) => {
  try {
    const services = await ServiceModel.findAllByBusiness(req.businessId);
    res.json({ success: true, data: services });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const service = await ServiceModel.findById(parseInt(req.params.id, 10), req.businessId);
    if (!service) return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    res.json({ success: true, data: service });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const service = await ServiceModel.create(req.businessId, req.body);
    res.status(201).json({ success: true, data: service });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const service = await ServiceModel.update(parseInt(req.params.id, 10), req.businessId, req.body);
    if (!service) return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    res.json({ success: true, data: service });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await ServiceModel.delete(parseInt(req.params.id, 10), req.businessId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    res.json({ success: true });
  } catch (err) { next(err); }
};

export { list, getById, create, update, remove };
