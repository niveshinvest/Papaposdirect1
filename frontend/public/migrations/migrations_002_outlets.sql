
-- PAPAPOS MIGRATION 002: OUTLETS SCHEMA
-- Target: Supabase / Postgres

CREATE TABLE IF NOT EXISTS public.outlets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('SHOP', 'GODOWN')),
    location TEXT,
    "subscriptionActive" BOOLEAN DEFAULT TRUE,
    "contactPerson" TEXT,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- Security (RLS)
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Outlets" ON public.outlets;
CREATE POLICY "Public Access Outlets" ON public.outlets FOR ALL USING (true) WITH CHECK (true);

-- Performance Index
CREATE INDEX IF NOT EXISTS idx_outlets_type ON public.outlets(type);

-- Record Migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (2, 'outlets_crud_support')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
