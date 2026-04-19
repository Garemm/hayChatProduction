-- ── password_resets migration ─────────────────────────────────────────────────
-- Run this once against your PostgreSQL database to support the
-- forgot-password / reset-password flow.

-- ── product_query_logs performance indexes ──────────────────────────────────
-- The analytics endpoints count individual log records grouped by business,
-- product, and hour extracted from created_at.  These three covering indexes
-- keep those GROUP BY / ORDER BY queries fast at high volume.
CREATE INDEX IF NOT EXISTS idx_pql_business_id  ON product_query_logs (business_id);
CREATE INDEX IF NOT EXISTS idx_pql_product_id   ON product_query_logs (product_id);
CREATE INDEX IF NOT EXISTS idx_pql_created_at   ON product_query_logs (created_at);

-- ── max_products on subscriptions ────────────────────────────────────────────
-- Stores the product limit for each subscription plan.
-- NULL means unlimited (no cap).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT NULL;

CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  admin_id   INTEGER      NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT         NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  used       BOOLEAN      NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);

-- ── product_query_logs ────────────────────────────────────────────────────────
-- Tracks how many times each product has been queried per business per day.
-- Used by the analytics dashboard to show top 10 consulted products.

CREATE TABLE IF NOT EXISTS product_query_logs (
  id          SERIAL PRIMARY KEY,
  business_id INTEGER      NOT NULL,
  product_id  INTEGER      NOT NULL,
  query_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
  query_count INTEGER      NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, product_id, query_date)
);

CREATE INDEX IF NOT EXISTS idx_pql_business_date ON product_query_logs (business_id, query_date);

-- ── Subscription management fields ───────────────────────────────────────────
-- is_active          → true when a subscription manager has activated this business.
--                      New businesses start as inactive (default false).
-- can_manage_subscriptions → true when this business's admin can access the
--                      Subscriptions panel and toggle other businesses' access.

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_active               BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS can_manage_subscriptions BOOLEAN NOT NULL DEFAULT FALSE;

-- 1. Crear tabla (igual que tienes)
CREATE TABLE IF NOT EXISTS business_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Insertar datos
INSERT INTO business_types (name) VALUES
('restaurant'),
('hardware'),
('stationery'),
('pharmacy'),
('clothing'),
('other')
ON CONFLICT (name) DO NOTHING;

-- 3. ELIMINAR CHECK ANTES DEL UPDATE (CLAVE)
ALTER TABLE businesses
DROP CONSTRAINT IF EXISTS businesses_category_check;

-- 4. Ahora sí hacer el UPDATE
UPDATE businesses b
SET category = bt.id::text
FROM business_types bt
WHERE b.category = bt.name;

-- 5. Convertir columna a INT
ALTER TABLE businesses
ALTER COLUMN category TYPE INT USING category::integer;

-- 6. Crear Foreign Key
ALTER TABLE businesses
ADD CONSTRAINT fk_business_category
FOREIGN KEY (category) REFERENCES business_types(id);

-- 7. Columna acepto_pedidos (si no existe)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS acepto_pedidos BOOLEAN NOT NULL DEFAULT FALSE;

-- ── liberado column on pedidos ───────────────────────────────────────────────
-- Marks whether an order has been "released" (handed to the customer / closed).
-- Admin panel only shows orders where liberado = FALSE.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS liberado BOOLEAN NOT NULL DEFAULT FALSE;

-- ── rechazado column on pedidos ────────────────────────────────────────────
-- true = the admin explicitly rejected this order.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS rechazado BOOLEAN NOT NULL DEFAULT FALSE;

-- ── notas_admin column on pedidos ────────────────────────────────────────────
-- Free-text notes the admin can write on each order.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS notas_admin TEXT;

-- ── pedido_listo column on pedidos ─────────────────────────────────────────
-- true = the order is ready for pickup. Set by the admin after accepting.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pedido_listo BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Chat UUID ────────────────────────────────────────────────────────────────
-- Unique public identifier for each business chat interface.
-- New businesses get a UUID v4 generated at creation time.
-- Existing businesses are left NULL (no back-fill required).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS chat_uuid UUID UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_chat_uuid ON businesses(chat_uuid);
