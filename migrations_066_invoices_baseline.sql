
-- PAPAPOS MIGRATION: INVOICE SCHEMA BASELINE & HARDENING
-- Target: Supabase / Postgres
-- Description: Ensures all canonical fields and constraints exist for the invoices table.

BEGIN;

-- 1. ENSURE TABLE EXISTS
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id),
    outlet_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CORE TRANSACTIONAL FIELDS
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS invoice_number TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS order_id TEXT,
ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'B2C',
ADD COLUMN IF NOT EXISTS irp_status TEXT DEFAULT 'NOT_GENERATED';

-- 3. FINANCIAL & GST FIELDS
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS subtotal NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS taxable_value NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tax NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS cgst_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS sgst_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS igst_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS round_off NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_amount NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_type TEXT NOT NULL DEFAULT 'CGST_SGST',
ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 0;

-- 4. STATE & LOCATION SNAPSHOTS (GST COMPLIANCE)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS billing_state_code TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS outlet_state_code TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS place_of_supply TEXT,
ADD COLUMN IF NOT EXISTS buyer_name TEXT,
ADD COLUMN IF NOT EXISTS buyer_gstin TEXT,
ADD COLUMN IF NOT EXISTS buyer_state_code TEXT;

-- 5. SELLER SNAPSHOTS (AUDIT TRAIL)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS seller_gstin TEXT,
ADD COLUMN IF NOT EXISTS seller_legal_name TEXT,
ADD COLUMN IF NOT EXISTS seller_trade_name TEXT,
ADD COLUMN IF NOT EXISTS seller_state_code TEXT;

-- 6. PAYMENT & AUDIT FIELDS
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Cash',
ADD COLUMN IF NOT EXISTS payment_mode_id UUID,
ADD COLUMN IF NOT EXISTS payment_mode_name TEXT,
ADD COLUMN IF NOT EXISTS finalized_by_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS staff_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 7. E-INVOICE & QR FIELDS
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS qr_payload TEXT,
ADD COLUMN IF NOT EXISTS irn TEXT,
ADD COLUMN IF NOT EXISTS irn_generated_at TIMESTAMPTZ;

-- 8. EDIT TRACKING
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS edit_reason TEXT,
ADD COLUMN IF NOT EXISTS edit_timestamp TIMESTAMPTZ;

-- 9. SYNC STATUS
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';

-- 10. CONSTRAINTS ENFORCEMENT
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_gst_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_gst_type_check 
    CHECK (gst_type = ANY (ARRAY['CGST_SGST'::text, 'IGST'::text]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_type_check 
    CHECK (invoice_type = ANY (ARRAY['B2B'::text, 'B2C'::text, 'TAX_INVOICE'::text, 'BILL_OF_SUPPLY'::text, 'PROFORMA'::text, 'CREDIT_NOTE'::text]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_irp_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_irp_status_check 
    CHECK (irp_status = ANY (ARRAY['NOT_GENERATED'::text, 'NOT_APPLICABLE'::text, 'PENDING'::text, 'GENERATED'::text, 'FAILED'::text, 'CANCELLED'::text]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_sync_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_sync_status_check 
    CHECK (sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'failed'::text, 'PENDING'::text, 'SYNCED'::text, 'FAILED'::text]));

-- 11. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_invoices_company_outlet ON public.invoices(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sync_status ON public.invoices(sync_status) WHERE sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);

COMMIT;
