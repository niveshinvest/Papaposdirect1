
-- PAPAPOS MIGRATION 006: ANALYTICS & GST COMPLIANCE
-- Target: Supabase / Postgres

-- 1. GST REPORTS (Monthly Summaries)
CREATE TABLE IF NOT EXISTS public.gst_reports (
    id TEXT PRIMARY KEY,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    "taxableValue" NUMERIC(15,2) DEFAULT 0,
    cgst NUMERIC(12,2) DEFAULT 0,
    sgst NUMERIC(12,2) DEFAULT 0,
    igst NUMERIC(12,2) DEFAULT 0,
    "totalTax" NUMERIC(15,2) DEFAULT 0,
    "totalInvoiceValue" NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'FILED')),
    "generatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "syncStatus" TEXT DEFAULT 'synced',
    CONSTRAINT unique_month_year UNIQUE (month, year)
);

-- 2. PERFORMANCE SNAPSHOTS (EOD Analytics)
CREATE TABLE IF NOT EXISTS public.report_snapshots (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    "totalSales" NUMERIC(15,2) DEFAULT 0,
    "orderCount" INTEGER DEFAULT 0,
    "avgOrderValue" NUMERIC(12,2) DEFAULT 0,
    "topCategory" TEXT,
    "wasteValue" NUMERIC(12,2) DEFAULT 0,
    "laborCost" NUMERIC(12,2),
    "syncStatus" TEXT DEFAULT 'synced'
);

-- 3. RLS
ALTER TABLE public.gst_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access GST Reports" ON public.gst_reports;
CREATE POLICY "Public Access GST Reports" ON public.gst_reports FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access Snapshots" ON public.report_snapshots;
CREATE POLICY "Public Access Snapshots" ON public.report_snapshots FOR ALL USING (true) WITH CHECK (true);

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_gst_period ON public.gst_reports(year, month);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON public.report_snapshots(date);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (6, 'analytical_compliance_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
