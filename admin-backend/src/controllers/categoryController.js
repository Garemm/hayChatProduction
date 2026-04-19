// ── Category Controller ───────────────────────────────────────────────────────
import CategoryModel from '../models/categoryModel.js';

// GET /categories
const list = async (req, res, next) => {
  try {
    const categories = await CategoryModel.findByBusiness(req.businessId);
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
};

// POST /categories  { name, parent_id? }
const create = async (req, res, next) => {
  try {
    const { name, parent_id } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
    }
    const existing = await CategoryModel.findByName(req.businessId, name.trim());
    if (existing) {
      return res.status(409).json({ success: false, error: 'Ya existe una categoría con ese nombre' });
    }
    const cat = await CategoryModel.create(req.businessId, name.trim(), parent_id ?? null);
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
};

// PUT /categories/:id  { name, parent_id? }
const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, parent_id } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
    }
    // Prevent a category from being its own parent
    if (parent_id != null && parseInt(parent_id, 10) === id) {
      return res.status(400).json({ success: false, error: 'Una categoría no puede ser su propio padre' });
    }
    const cat = await CategoryModel.update(id, req.businessId, name.trim(), parent_id ?? null);
    if (!cat) return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
};

// DELETE /categories/:id
const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await CategoryModel.delete(id, req.businessId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    res.json({ success: true });
  } catch (err) { next(err); }
};

export { list, create, update, remove };
