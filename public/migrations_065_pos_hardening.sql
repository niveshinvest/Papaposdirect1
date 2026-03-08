
-- PAPAPOS MIGRATION 065: POS HARDENING & SYNC COMPLIANCE
-- Target: Supabase / Postgres
-- Description: Standardizes sync_status, adds missing audit columns, and resolves constraint mismatches.

-- 1. ORDERS TABLE HARDENING
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
ADD COLUMN IF NOT EXISTS staff_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Fix sync_status constraint (Case mismatch: code uses lowercase)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_sync_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_sync_status_check 
    CHECK (sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'failed'::text, 'PENDING'::text, 'SYNCED'::text, 'FAILED'::text]));

-- Backfill sync_status from legacy syncStatus if exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='syncStatus') THEN
        UPDATE public.orders SET sync_status = LOWER("syncStatus") WHERE sync_status IS NULL OR sync_status = 'synced';
    END IF;
END $$;

-- 2. INVOICES TABLE HARDENING
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
ADD COLUMN IF NOT EXISTS staff_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS edit_reason TEXT,
ADD COLUMN IF NOT EXISTS edit_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_mode_name TEXT, -- Snapshot for audit trail
ADD COLUMN IF NOT EXISTS place_of_supply TEXT, -- Legal requirement for GST
ADD COLUMN IF NOT EXISTS qr_payload TEXT, -- Legally required for GST QR codes
ADD COLUMN IF NOT EXISTS seller_gstin TEXT,
ADD COLUMN IF NOT EXISTS seller_legal_name TEXT,
ADD COLUMN IF NOT EXISTS seller_trade_name TEXT,
ADD COLUMN IF NOT EXISTS seller_state_code TEXT,
ADD COLUMN IF NOT EXISTS irn TEXT,
ADD COLUMN IF NOT EXISTS irn_generated_at TIMESTAMPTZ;

-- Fix invoices constraints (Value drift)
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_type_check 
    CHECK (invoice_type = ANY (ARRAY['B2B'::text, 'B2C'::text, 'TAX_INVOICE'::text, 'BILL_OF_SUPPLY'::text, 'PROFORMA'::text, 'CREDIT_NOTE'::text]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_irp_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_irp_status_check 
    CHECK (irp_status = ANY (ARRAY['NOT_GENERATED'::text, 'NOT_APPLICABLE'::text, 'PENDING'::text, 'GENERATED'::text, 'FAILED'::text, 'CANCELLED'::text]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_sync_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_sync_status_check 
    CHECK (sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'failed'::text, 'PENDING'::text, 'SYNCED'::text, 'FAILED'::text]));

-- 3. INVOICE_ITEMS TABLE HARDENING
ALTER TABLE public.invoice_items 
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
ADD COLUMN IF NOT EXISTS staff_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Fix sync_status constraint
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_sync_status_check;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_sync_status_check 
    CHECK (sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'failed'::text, 'PENDING'::text, 'SYNCED'::text, 'FAILED'::text]));

-- Fix Foreign Key for Offline Sync (Deferrable)
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey 
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) 
    ON DELETE CASCADE 
    DEFERRABLE INITIALLY DEFERRED;

-- 4. KITCHEN_ORDERS TABLE HARDENING
ALTER TABLE public.kitchen_orders 
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
ADD COLUMN IF NOT EXISTS staff_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 5. RPC: EDIT INVOICE (Needed for POS ↔ KOT consistency)
CREATE OR REPLACE FUNCTION public.edit_invoice(
    p_invoice_id UUID,
    p_new_subtotal NUMERIC,
    p_new_total_tax NUMERIC,
    p_new_grand_total NUMERIC,
    p_new_items JSONB, -- Array of {menu_item_id, quantity, taxable_value, total_amount, ...}
    p_edit_reason TEXT,
    p_actor_id UUID
)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $func$
DECLARE
    v_order_id TEXT;
    v_company_id UUID;
    v_outlet_id TEXT;
    v_item RECORD;
BEGIN
    -- Get context
    SELECT order_id, company_id, outlet_id INTO v_order_id, v_company_id, v_outlet_id
    FROM public.invoices WHERE id = p_invoice_id;

    -- 1. Update Invoice Header
    UPDATE public.invoices SET
        subtotal = p_new_subtotal,
        taxable_value = p_new_subtotal,
        total_tax = p_new_total_tax,
        grand_total = p_new_grand_total,
        total_amount = p_new_grand_total,
        is_edited = TRUE,
        edit_reason = p_edit_reason,
        edit_timestamp = NOW(),
        updated_at = NOW(),
        version = version + 1
    WHERE id = p_invoice_id;

    -- 2. Update Invoice Items (Replace existing)
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
    
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_new_items) AS x(
        menu_item_id UUID, 
        quantity NUMERIC, 
        taxable_value NUMERIC, 
        cgst_amount NUMERIC, 
        sgst_amount NUMERIC, 
        igst_amount NUMERIC, 
        total_amount NUMERIC,
        selected_modifiers JSONB
    )
    LOOP
        INSERT INTO public.invoice_items (
            invoice_id, menu_item_id, quantity, taxable_value, 
            cgst_amount, sgst_amount, igst_amount, total_amount,
            selected_modifiers, company_id, outlet_id, sync_status
        ) VALUES (
            p_invoice_id, v_item.menu_item_id, v_item.quantity, v_item.taxable_value,
            v_item.cgst_amount, v_item.sgst_amount, v_item.igst_amount, v_item.total_amount,
            v_item.selected_modifiers, v_company_id, v_outlet_id, 'synced'
        );
    END LOOP;

    -- 3. Update Order (Mirror)
    UPDATE public.orders SET
        total = p_new_grand_total,
        "isEdited" = TRUE,
        "editReason" = p_edit_reason,
        "editTimestamp" = NOW(),
        sync_status = 'synced'
    WHERE id = v_order_id;

    -- 4. Update KOT (Mirror)
    UPDATE public.kitchen_orders SET
        items = (
            SELECT jsonb_agg(jsonb_build_object('name', m.name, 'quantity', x.quantity, 'notes', 'EDITED'))
            FROM jsonb_to_recordset(p_new_items) AS x(menu_item_id UUID, quantity NUMERIC)
            JOIN public.menu_items m ON m.id = x.menu_item_id
        ),
        updated_at = NOW()
    WHERE order_id = v_order_id;

END;
$func$;

-- 6. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (65, 'pos_hardening_sync_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
