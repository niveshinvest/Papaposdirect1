
-- PAPAPOS MIGRATION 001: INITIAL SCHEMA
-- Target: Supabase / Postgres
-- Description: Creates core tables including the Synchronized Recycle Bin for data restoration.

-- ==========================================
-- 1. VERSION TRACKING SYSTEM
-- ==========================================
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. CORE TABLES
-- ==========================================

-- Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    "tableId" TEXT DEFAULT 'Takeaway',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    "paymentMethodId" TEXT,
    "isEdited" BOOLEAN DEFAULT FALSE,
    "editReason" TEXT,
    "editTimestamp" TIMESTAMPTZ,
    "originalTotal" NUMERIC(12,2),
    "originalItems" JSONB,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- Inventory Table
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "itemType" TEXT CHECK ("itemType" IN ('RAW_MATERIAL', 'FINISHED_PRODUCT', 'SEMI_FINISHED')),
    quantity NUMERIC(12,4) DEFAULT 0,
    unit TEXT,
    "salesUnit" TEXT,
    "conversionFactor" NUMERIC(12,4) DEFAULT 1,
    "costPrice" NUMERIC(12,2) DEFAULT 0,
    "unitPrice" NUMERIC(12,4) DEFAULT 0,
    "sellingPrice" NUMERIC(12,2) DEFAULT 0,
    category TEXT,
    "minStockLevel" NUMERIC(12,4) DEFAULT 0,
    "gstPercentage" NUMERIC(5,2) DEFAULT 5,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    image TEXT,
    "outletId" TEXT,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- Menu Table
CREATE TABLE IF NOT EXISTS public.menu (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    category TEXT,
    image TEXT,
    available BOOLEAN DEFAULT TRUE,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- Recipes Table
CREATE TABLE IF NOT EXISTS public.recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "menuItemId" TEXT,
    "inventoryItemId" TEXT,
    ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
    "totalCost" NUMERIC(12,2) DEFAULT 0,
    yield NUMERIC(12,4) DEFAULT 1,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- Purchase Orders Table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id TEXT PRIMARY KEY,
    vendor TEXT NOT NULL,
    "orderDate" TEXT,
    "expectedDeliveryDate" TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'Pending',
    "totalAmount" NUMERIC(12,2) DEFAULT 0,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    orders INTEGER DEFAULT 0,
    spent NUMERIC(12,2) DEFAULT 0,
    points INTEGER DEFAULT 0,
    "lastSeen" TEXT,
    tier TEXT DEFAULT 'New',
    birthday TEXT,
    anniversary TEXT,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- Synchronized Recycle Bin (The Vault)
CREATE TABLE IF NOT EXISTS public.recycle_bin (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data JSONB NOT NULL,
    "deletedAt" TIMESTAMPTZ DEFAULT NOW(),
    "syncStatus" TEXT DEFAULT 'synced'
);

-- ==========================================
-- 3. PERFORMANCE INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON public.orders(timestamp);
CREATE INDEX IF NOT EXISTS idx_inventory_outlet ON public.inventory("outletId");
CREATE INDEX IF NOT EXISTS idx_recycle_expiry ON public.recycle_bin("deletedAt");
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON public.purchase_orders(vendor);

-- ==========================================
-- 4. SECURITY (RLS)
-- ==========================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recycle_bin ENABLE ROW LEVEL SECURITY;

-- Reset and recreate policies for internal migration repeatability
DROP POLICY IF EXISTS "Public Access" ON public.orders;
DROP POLICY IF EXISTS "Public Access" ON public.inventory;
DROP POLICY IF EXISTS "Public Access" ON public.menu;
DROP POLICY IF EXISTS "Public Access" ON public.recipes;
DROP POLICY IF EXISTS "Public Access" ON public.categories;
DROP POLICY IF EXISTS "Public Access" ON public.purchase_orders;
DROP POLICY IF EXISTS "Public Access" ON public.customers;
DROP POLICY IF EXISTS "Public Access" ON public.recycle_bin;

CREATE POLICY "Public Access" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.menu FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.recycle_bin FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- 5. MIGRATION EXECUTION HELPER
-- ==========================================
CREATE OR REPLACE FUNCTION public.exec_sql(sql_query TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 6. GRANTS
-- ==========================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO anon, authenticated, service_role;

-- ==========================================
-- 7. RECORD MIGRATION
-- ==========================================
INSERT INTO public.schema_migrations (version, name) 
VALUES (1, 'initial_schema_with_crm_and_procurement')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
