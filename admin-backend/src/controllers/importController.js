// ── Import Controller ─────────────────────────────────────────────────────────
// Handles bulk product import via CSV or Excel.
//
// Three-phase flow:
//   POST /import/preview  — parse file, validate, detect missing categories
//   POST /import/confirm  — upsert rows; if missing categories → confirm creation
//   POST /import/confirm  — with createMissingCategories:true → create cats + upsert
//
// Required columns: item_code, name, price (stock + category are validated too)
import multer from 'multer';
import ExcelJS from 'exceljs';
import csv from 'csv-parser';
import { Readable } from 'stream';
import db from '../config/database.js';
import ProductModel from '../models/productModel.js';
import CategoryModel from '../models/categoryModel.js';

// ── Multer — memory storage, 5 MB limit ──────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (['csv', 'xlsx', 'xls'].includes(ext) ||
        ['text/csv',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-excel'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos CSV o Excel (.csv, .xlsx, .xls)'));
    }
  },
}).single('file');

// ── Column-name normalizer ────────────────────────────────────────────────────
const COLUMN_MAP = {
  // item_code (required)
  'item code':          'item_code',
  'item_code':          'item_code',
  'item_code_empresa':  'item_code',
  'código':             'item_code',
  'codigo':             'item_code',
  'sku':                'item_code',
  // name (required)
  'nombre':   'name',
  'name':     'name',
  'producto': 'name',
  // price (required)
  'precio': 'price',
  'price':  'price',
  // stock (required)
  'stock':          'stock_quantity',
  'cantidad':       'stock_quantity',
  'stock_quantity': 'stock_quantity',
  'inventario':     'stock_quantity',
  'qty':            'stock_quantity',
  // category (required for validation)
  'categoria':  'category',
  'categoría':  'category',
  'category':   'category',
  'cat':        'category',
  // optional fields
  'descripcion':  'description',
  'descripción':  'description',
  'description':  'description',
  'disponible':   'is_available',
  'available':    'is_available',
  'is_available': 'is_available',
  'activo':       'is_available',
  'active':       'is_available',
};

const normalizeKey = (k) => COLUMN_MAP[k.trim().toLowerCase()] ?? k.trim().toLowerCase();

// ── Parse CSV ─────────────────────────────────────────────────────────────────
const parseCSV = (buffer) =>
  new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csv({ mapHeaders: ({ header }) => normalizeKey(header) }))
      .on('data', (row) => rows.push(row))
      .on('end',  () => resolve(rows))
      .on('error', reject);
  });

// ── Parse Excel ───────────────────────────────────────────────────────────────

// ExcelJS cell values can be objects (formula results, rich text, hyperlinks).
// Unwrap them to a plain JS value so empty-row detection works correctly.
const extractCellValue = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    // Formula / shared formula: { formula, result, ... }
    if ('result'       in v) return extractCellValue(v.result);
    if ('sharedFormula' in v) return extractCellValue(v.result);
    // Rich text: { richText: [{ text: '...' }, ...] }
    if ('richText' in v) return v.richText.map((r) => String(r.text ?? '')).join('') || null;
    // Hyperlink: { text: '...', hyperlink: '...' }
    if ('text' in v) return String(v.text ?? '') || null;
    return null; // unknown object → treat as empty
  }
  return v;
};

const parseExcel = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El archivo Excel no tiene hojas de datos');

  let headers = [];
  const rows  = [];

  sheet.eachRow((row, rowNumber) => {
    // exceljs: index 0 is always undefined; unwrap each cell value
    const values = row.values.slice(1).map(extractCellValue);

    if (rowNumber === 1) {
      headers = values.map((h) => normalizeKey(String(h ?? '')));
    } else {
      // Skip rows where every cell is null/empty after unwrapping
      if (values.every((v) => v == null || String(v).trim() === '')) return;
      const obj = {};
      headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
      rows.push(obj);
    }
  });

  return rows;
};

// ── Validate required columns exist in the file ───────────────────────────────
const REQUIRED_COLUMNS = ['item_code', 'name', 'price'];

const checkRequiredColumns = (sampleRow) => {
  const keys = Object.keys(sampleRow);
  const missing = REQUIRED_COLUMNS.filter((col) => !keys.includes(col));
  return missing; // empty array = all present
};

// ── Validate & enrich a single raw row ───────────────────────────────────────
// categories: array of { id, name } for this business (already loaded)
// categoryIndex: Map<lowercased_name, id> for O(1) lookup
const validateRow = (raw, categoryIndex, rowNumber) => {
  const errors   = [];
  const warnings = [];

  // ── item_code (required) ──
  const item_code = String(raw.item_code ?? '').trim();
  if (!item_code) errors.push('item_code es obligatorio');

  // ── name (required) ──
  const name = String(raw.name ?? '').trim();
  if (!name) errors.push('Nombre es obligatorio');

  // ── price (required, non-negative) ──
  const rawPrice = String(raw.price ?? '').replace(',', '.').trim();
  const price    = parseFloat(rawPrice);
  if (!rawPrice || isNaN(price) || price < 0) errors.push('Precio inválido (debe ser un número ≥ 0)');

  // ── stock (required, non-negative integer) ──
  const rawStock     = String(raw.stock_quantity ?? '').trim();
  const stockParsed  = parseInt(rawStock, 10);
  const stock_quantity = isNaN(stockParsed) || stockParsed < 0 ? 0 : stockParsed;
  if (rawStock !== '' && (isNaN(stockParsed) || stockParsed < 0)) {
    warnings.push('Stock inválido, se usará 0');
  }

  // ── description (optional) ──
  const description = String(raw.description ?? '').trim() || null;

  // ── is_available (optional, default true) ──
  const rawAvail   = String(raw.is_available ?? 'true').trim().toLowerCase();
  const is_available = !['false', '0', 'no', 'inactivo', 'inactive'].includes(rawAvail);

  // ── category (required string, resolve to id) ──
  const rawCat    = String(raw.category ?? '').trim();
  let category_id = null;
  let missingCategory = null;

  if (!rawCat) {
    warnings.push('Categoría no especificada');
  } else {
    const found = categoryIndex.get(rawCat.toLowerCase());
    if (found != null) {
      category_id = found;
    } else {
      missingCategory = rawCat;
      warnings.push(`Categoría "${rawCat}" no existe — se creará o asignará al confirmar`);
    }
  }

  return {
    _rowIndex:       rowNumber,
    item_code,
    name,
    description,
    price:           isNaN(price) ? 0 : price,
    category_id,
    category_name:   rawCat,
    missingCategory,  // non-null = this row needs category creation
    is_available,
    stock_quantity,
    _status:  errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid',
    _errors:  errors,
    _warnings: warnings,
  };
};

// ── Batch upsert via single DB transaction ────────────────────────────────────
// Returns { added: [], updated: [], errors: [] }
const batchUpsert = async (businessId, rows, client) => {
  const added   = [];
  const updated = [];
  const errors  = [];

  for (const row of rows) {
    if (row._status === 'error') {
      errors.push({ item_code: row.item_code, name: row.name, reason: (row._errors || []).join('; ') });
      continue;
    }
    try {
      // Remap field name → model expects item_code_empresa
      const { action, product } = await ProductModel.upsertByItemCode(businessId, {
        ...row,
        item_code_empresa: row.item_code,
      }, client);
      if (action === 'inserted') added.push({ item_code: row.item_code, name: product.name });
      else                       updated.push({ item_code: row.item_code, name: product.name });
    } catch (err) {
      errors.push({ item_code: row.item_code, name: row.name, reason: err.message });
    }
  }

  return { added, updated, errors };
};

// ── POST /import/preview ──────────────────────────────────────────────────────
// Parses the uploaded file and returns validated rows + list of unknown categories.
const preview = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });

    try {
      const { mimetype, originalname, buffer } = req.file;
      const isExcel = mimetype.includes('openxmlformats') ||
                      mimetype.includes('vnd.ms-excel') ||
                      /\.(xlsx|xls)$/i.test(originalname);

      let rawRows;
      try {
        rawRows = isExcel ? await parseExcel(buffer) : await parseCSV(buffer);
      } catch (parseErr) {
        return res.status(400).json({ success: false, error: `No se pudo leer el archivo: ${parseErr.message}` });
      }

      if (rawRows.length === 0) {
        return res.status(400).json({ success: false, error: 'El archivo está vacío o no contiene filas de datos' });
      }

      // ── Column presence check ──
      const missingColumns = checkRequiredColumns(rawRows[0]);
      if (missingColumns.length > 0) {
        return res.status(400).json({
          success: false,
          error:   `El archivo no contiene las columnas requeridas: ${missingColumns.join(', ')}. ` +
                   `Descarga la plantilla para ver el formato correcto.`,
          missingColumns,
        });
      }

      // ── Load categories and build index ──
      const categories    = await CategoryModel.findByBusiness(req.businessId);
      const categoryIndex = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

      // ── Validate each row ──
      const rows = rawRows.map((raw, i) => validateRow(raw, categoryIndex, i + 2));

      // ── Collect unique unknown categories ──
      const missingCategorySet = new Set(
        rows
          .map((r) => r.missingCategory)
          .filter(Boolean)
      );
      const missingCategories = [...missingCategorySet];

      const summary = {
        total:   rows.length,
        valid:   rows.filter((r) => r._status === 'valid').length,
        warning: rows.filter((r) => r._status === 'warning').length,
        error:   rows.filter((r) => r._status === 'error').length,
      };

      res.json({
        success: true,
        data:    { rows, summary, missingCategories },
      });
    } catch (internalErr) {
      next(internalErr);
    }
  });
};

// ── POST /import/confirm ──────────────────────────────────────────────────────
// Body: { rows, createMissingCategories?: boolean }
//
// If any row has a missingCategory and createMissingCategories is NOT true,
// the server returns { needsCategoryConfirm: true, missingCategories: [...] }.
// The frontend must then ask the user and re-call with createMissingCategories:true.
const confirm = async (req, res, next) => {
  try {
    const { rows, createMissingCategories = false } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay filas para importar' });
    }

    // ── Collect unknown categories still present in the submitted rows ────────
    // Only consider a row's category as "unknown" if the user has NOT already
    // assigned a category_id via the preview dropdown.
    const unknownSet = new Set(
      rows.filter((r) => r.missingCategory && !r.category_id).map((r) => r.missingCategory)
    );
    const unknownCategories = [...unknownSet];

    if (unknownCategories.length > 0 && !createMissingCategories) {
      // Ask the frontend to confirm category creation
      return res.json({
        success:              true,
        needsCategoryConfirm: true,
        missingCategories:    unknownCategories,
      });
    }

    // ── Resolve or create missing categories ─────────────────────────────────
    let resolvedRows = rows;

    if (unknownCategories.length > 0 && createMissingCategories) {
      const created = await CategoryModel.createMany(req.businessId, unknownCategories);
      // Build updated index (existing + newly created)
      const existingCats   = await CategoryModel.findByBusiness(req.businessId);
      const categoryIndex  = new Map(existingCats.map((c) => [c.name.toLowerCase(), c.id]));

      // Patch category_id on rows that had a missing category AND no user-selected id
      resolvedRows = rows.map((row) => {
        if (row.missingCategory && !row.category_id) {
          const id = categoryIndex.get(row.missingCategory.toLowerCase());
          return {
            ...row,
            category_id:     id ?? null,
            missingCategory: null,
            // The warning about missing category is no longer relevant
            _warnings: (row._warnings || []).filter((w) => !w.includes('no existe')),
            _status:   row._status === 'warning' && (row._errors || []).length === 0 ? 'valid' : row._status,
          };
        }
        // Row already has category_id (user selected it); just clear the stale flag
        return row.missingCategory ? { ...row, missingCategory: null } : row;
      });

      console.log(`[import] Created ${created.length} new categories:`, created.map((c) => c.name));
    }

    // ── Subscription product-limit check ─────────────────────────────────────
    // Count how many rows in this batch are new inserts (item_code not yet in DB).
    // Updates to existing products don't count against the limit.
    const maxProducts = await ProductModel.getSubscriptionLimit(req.businessId);
    if (maxProducts !== null) {
      const validRows = resolvedRows.filter((r) => r._status !== 'error');
      if (validRows.length > 0) {
        const incomingCodes = validRows.map((r) => r.item_code);
        const { rows: existingRows } = await db.query(
          `SELECT item_code_empresa FROM products
           WHERE business_id = $1 AND item_code_empresa = ANY($2::text[])`,
          [req.businessId, incomingCodes]
        );
        const existingSet = new Set(existingRows.map((r) => r.item_code_empresa));
        const newCount    = incomingCodes.filter((c) => !existingSet.has(c)).length;

        if (newCount > 0) {
          const currentCount = await ProductModel.countByBusiness(req.businessId);
          const available    = maxProducts - currentCount;
          if (available <= 0) {
            return res.status(403).json({
              success: false,
              error: 'Has alcanzado el límite de productos permitido por tu plan actual. ' +
                     'Puedes actualizar tu suscripción para continuar agregando más productos.',
            });
          }
          if (newCount > available) {
            return res.status(403).json({
              success: false,
              error: `Tu plan actual solo permite agregar ${available} producto(s) más. ` +
                     `El archivo tiene ${newCount} productos nuevos. ` +
                     'Actualiza tu suscripción para importar todos.',
            });
          }
        }
      }
    }

    // ── Execute batch upsert inside a single transaction ──────────────────────
    const client = await db.connect();
    let result;
    try {
      await client.query('BEGIN');
      result = await batchUpsert(req.businessId, resolvedRows, client);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      data: {
        added:        result.added.length,
        updated:      result.updated.length,
        errors:       result.errors,
        added_list:   result.added,
        updated_list: result.updated,
      },
    });
  } catch (err) {
    next(err);
  }
};

export { preview, confirm };
