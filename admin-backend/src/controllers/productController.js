// ── Product Controller ────────────────────────────────────────────────────────
import ProductModel from '../models/productModel.js';
import CategoryModel from '../models/categoryModel.js';

// ── Friendly duplicate item_code error ───────────────────────────────────────
const UNIQUE_ITEM_CODE_CONSTRAINT = 'idx_products_item_code';

const buildDuplicateItemCodeError = async (businessId, itemCode) => {
  try {
    const existing = await ProductModel.findByItemCode(businessId, itemCode);
    const productName = existing?.name ? `"${existing.name}"` : 'otro producto';
    return new Error(
      `El código de ítem "${itemCode}" ya está en uso por el producto ${productName}. ` +
      `Si deseas actualizarlo, edítalo desde la pestaña "Productos" o impórtalo desde "Importar Productos".`
    );
  } catch {
    return new Error(
      `El código de ítem "${itemCode}" ya está en uso por otro producto. ` +
      `Puedes editarlo desde la pestaña "Productos" o importarlo desde "Importar Productos".`
    );
  }
};

const list = async (req, res, next) => {
  try {
    const products = await ProductModel.findAllByBusiness(req.businessId);
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const product = await ProductModel.findById(parseInt(req.params.id, 10), req.businessId);
    if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    // ── Subscription product-limit check ─────────────────────────────────────
    const maxProducts = await ProductModel.getSubscriptionLimit(req.businessId);
    if (maxProducts !== null) {
      const currentCount = await ProductModel.countByBusiness(req.businessId);
      if (currentCount >= maxProducts) {
        return res.status(403).json({
          success: false,
          error: 'Has alcanzado el límite de productos permitido por tu plan actual. ' +
                 'Puedes actualizar tu suscripción para continuar agregando más productos.',
        });
      }
    }

    const product = await ProductModel.create(req.businessId, req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    if (err.code === '23505' && err.constraint === UNIQUE_ITEM_CODE_CONSTRAINT) {
      return next(await buildDuplicateItemCodeError(req.businessId, req.body.item_code_empresa));
    }
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const product = await ProductModel.update(parseInt(req.params.id, 10), req.businessId, req.body);
    if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    res.json({ success: true, data: product });
  } catch (err) {
    if (err.code === '23505' && err.constraint === UNIQUE_ITEM_CODE_CONSTRAINT) {
      return next(await buildDuplicateItemCodeError(req.businessId, req.body.item_code_empresa));
    }
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await ProductModel.delete(parseInt(req.params.id, 10), req.businessId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    res.json({ success: true });
  } catch (err) { next(err); }
};

const listCategories = async (req, res, next) => {
  try {
    const categories = await CategoryModel.findByBusiness(req.businessId);
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
};

export { list, getById, create, update, remove, listCategories };
