
-- PAPAPOS MIGRATION 019: TABLES & FLOOR MANAGEMENT
-- Target: Supabase / Postgres

CREATE TABLE IF NOT EXISTS public.tables (
    id TEXT PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT REFERENCES public.outlets(id),
    name TEXT NOT NULL,
    section TEXT DEFAULT 'Main',
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved')),
    capacity INTEGER DEFAULT 4,
    "syncStatus" TEXT DEFAULT 'synced',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tables visibility" ON public.tables
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Management manage tables" ON public.tables
    FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tables_outlet ON public.tables(outlet_id);
CREATE INDEX IF NOT EXISTS idx_tables_company ON public.tables(company_id);

-- RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (19, 'floor_tables_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
