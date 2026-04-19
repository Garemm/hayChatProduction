// ── Admin Router — root ──────────────────────────────────────────────────────
import { Router } from 'express';
import requireAuth from '../middlewares/requireAuth.js';
import BusinessModel from '../models/businessModel.js';
import * as authController from '../controllers/authController.js';
import * as registerController from '../controllers/registerController.js';
import * as businessController from '../controllers/businessController.js';
import * as productController from '../controllers/productController.js';
import * as categoryController from '../controllers/categoryController.js';
import * as importController from '../controllers/importController.js';
import * as serviceController from '../controllers/serviceController.js';
import * as promotionController from '../controllers/promotionController.js';
import * as hoursController from '../controllers/hoursController.js';
import * as analyticsController from '../controllers/analyticsController.js';
import * as subscriptionController from '../controllers/subscriptionController.js';
import requireSubscriptionPermission from '../middlewares/requireSubscriptionPermission.js';
import * as businessTypeController from '../controllers/businessTypeController.js';
import * as pedidosController from '../controllers/pedidosController.js';
import * as legalController from '../controllers/legalController.js';

const router = Router();

// ── Auth (public) ─────────────────────────────────────────────────────────────
router.post('/login',           authController.login);
router.post('/register',        registerController.register);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);// Refresh + logout use the HTTP-only cookie — no access token needed
router.post('/refresh',         authController.refreshToken);
router.post('/logout',          authController.logout);
// ── Public catalogue endpoints ────────────────────────────────────────────────
router.get('/business-types',   businessTypeController.list);
router.get('/legal/:type',      legalController.getDocument);
// ── Public chat endpoint — resolves chat_uuid → business info ─────────────────
router.get('/chat/:chat_uuid',  async (req, res, next) => {
  try {
    const biz = await BusinessModel.findByChatUuid(req.params.chat_uuid);
    if (!biz) return res.status(404).json({ success: false, error: 'Chat no encontrado' });
    res.json({ success: true, data: biz });
  } catch (err) { next(err); }
});
// ── All routes below require auth ────────────────────────────────────────────
router.use(requireAuth);

// ── Change password (authenticated) ──────────────────────────────────────────
router.put('/change-password', authController.changePassword);

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.get('/dashboard', businessController.getStats);

// ── Business info ─────────────────────────────────────────────────────────────
router.get('/business',  businessController.getInfo);
router.put('/business',  businessController.updateInfo);

// ── Categories ────────────────────────────────────────────────────────────────
router.get('/categories',        categoryController.list);
router.post('/categories',       categoryController.create);
router.put('/categories/:id',    categoryController.update);
router.delete('/categories/:id', categoryController.remove);

// ── Products ──────────────────────────────────────────────────────────────────
// Import routes must come before /:id to avoid Express matching "import" as an id
router.post('/products/import/preview', importController.preview);
router.post('/products/import/confirm', importController.confirm);

router.get('/products',      productController.list);
router.get('/products/:id',  productController.getById);
router.post('/products',     productController.create);
router.put('/products/:id',  productController.update);
router.delete('/products/:id', productController.remove);

// ── Services ──────────────────────────────────────────────────────────────────
router.get('/services',      serviceController.list);
router.get('/services/:id',  serviceController.getById);
router.post('/services',     serviceController.create);
router.put('/services/:id',  serviceController.update);
router.delete('/services/:id', serviceController.remove);

// ── Promotions ────────────────────────────────────────────────────────────────
router.get('/promotions',      promotionController.list);
router.get('/promotions/:id',  promotionController.getById);
router.post('/promotions',     promotionController.create);
router.put('/promotions/:id',  promotionController.update);
router.delete('/promotions/:id', promotionController.remove);

// ── Business Hours ────────────────────────────────────────────────────────────
router.get('/hours',        hoursController.list);
router.post('/hours/bulk',  hoursController.bulkSave);
router.post('/hours',       hoursController.upsertOne);
router.delete('/hours/:id', hoursController.remove);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics/top-products/:business_id',    analyticsController.getTopProducts);
router.get('/analytics/traffic-by-hour/:business_id', analyticsController.getTrafficByHour);

// ── Subscriptions (requires tipo_permiso = 1 — manejo de suscriptores) ──────────────
router.get('/subscriptions',           requireSubscriptionPermission, subscriptionController.list);
router.put('/subscriptions/:id',        requireSubscriptionPermission, subscriptionController.toggle);
router.put('/subscriptions/:id/plan',   requireSubscriptionPermission, subscriptionController.setPlan);

// ── Pedidos ───────────────────────────────────────────────────────────────────
router.get('/orders/today',             pedidosController.listToday);router.put('/orders/:id',               pedidosController.updateOrder);router.put('/business/acepto-pedidos',  pedidosController.toggleAceptaPedidos);

export default router;
