-- 1) Extend event_queue for retry metadata
ALTER TABLE IF EXISTS event_queue
  ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- 2) Function to enqueue invoice events
CREATE OR REPLACE FUNCTION public.enqueue_invoice_event()
RETURNS trigger AS $$
DECLARE
  v_event text;
  v_payload jsonb;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_event := 'invoice.created';
    v_payload := to_jsonb(NEW);
  ELSIF (TG_OP = 'UPDATE') THEN
    IF lower(COALESCE(to_jsonb(NEW)->>'status', '')) = 'cancelled'
      AND lower(COALESCE(to_jsonb(OLD)->>'status', '')) <> 'cancelled' THEN
      v_event := 'invoice.cancelled';
    ELSE
      v_event := 'invoice.updated';
    END IF;
    v_payload := to_jsonb(NEW);
  ELSIF (TG_OP = 'DELETE') THEN
    v_event := 'invoice.cancelled';
    v_payload := to_jsonb(OLD);
  END IF;

  IF v_event IS NOT NULL THEN
    INSERT INTO event_queue(event, module, company_id, outlet_id, resource_id, payload)
    VALUES (v_event, 'invoices',
      COALESCE( (CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END)::uuid, NULL ),
      COALESCE( (CASE WHEN TG_OP = 'DELETE' THEN OLD.outlet_id ELSE NEW.outlet_id END), NULL ),
      COALESCE( (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END), NULL ),
      v_payload
    );
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Function to enqueue payment events
CREATE OR REPLACE FUNCTION public.enqueue_payment_event()
RETURNS trigger AS $$
DECLARE v_payload jsonb;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_payload := to_jsonb(NEW);
    INSERT INTO event_queue(event, module, company_id, outlet_id, resource_id, payload)
    VALUES ('payment.received', 'payments', COALESCE(NEW.company_id::uuid, NULL), COALESCE(NEW.outlet_id, NULL), COALESCE(NEW.id, NULL), v_payload);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Function to enqueue inventory events and low-stock
CREATE OR REPLACE FUNCTION public.enqueue_inventory_event()
RETURNS trigger AS $$
DECLARE
  v_payload jsonb;
  v_event text;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_event := 'inventory.updated';
    v_payload := to_jsonb(NEW);
    INSERT INTO event_queue(event, module, company_id, outlet_id, resource_id, payload)
    VALUES (v_event, 'inventory', COALESCE(NEW.company_id::uuid, NULL), COALESCE(NEW.outlet_id, NULL), COALESCE(NEW.id, NULL), v_payload);
  ELSIF (TG_OP = 'UPDATE') THEN
    v_event := 'inventory.updated';
    v_payload := to_jsonb(NEW);
    INSERT INTO event_queue(event, module, company_id, outlet_id, resource_id, payload)
    VALUES (v_event, 'inventory', COALESCE(NEW.company_id::uuid, NULL), COALESCE(NEW.outlet_id, NULL), COALESCE(NEW.id, NULL), v_payload);

    -- low stock detection
    IF NEW.quantity IS NOT NULL AND NEW.minStockLevel IS NOT NULL AND NEW.quantity < NEW.minStockLevel THEN
      INSERT INTO event_queue(event, module, company_id, outlet_id, resource_id, payload)
      VALUES ('stock.low', 'inventory', COALESCE(NEW.company_id::uuid, NULL), COALESCE(NEW.outlet_id, NULL), COALESCE(NEW.id, NULL), to_jsonb(NEW));
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Attach triggers (if tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    -- avoid duplicate triggers
    PERFORM 1 FROM pg_trigger WHERE tgname = 'trg_enqueue_invoice';
    IF NOT FOUND THEN
      CREATE TRIGGER trg_enqueue_invoice AFTER INSERT OR UPDATE OR DELETE ON public.invoices
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_invoice_event();
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payments') THEN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'trg_enqueue_payment';
    IF NOT FOUND THEN
      CREATE TRIGGER trg_enqueue_payment AFTER INSERT ON public.payments
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_payment_event();
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory') THEN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'trg_enqueue_inventory';
    IF NOT FOUND THEN
      CREATE TRIGGER trg_enqueue_inventory AFTER INSERT OR UPDATE ON public.inventory
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_inventory_event();
    END IF;
  END IF;
END$$;
