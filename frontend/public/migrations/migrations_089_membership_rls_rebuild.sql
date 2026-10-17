-- PAPAPOS MIGRATION 089: MEMBERSHIP-AWARE RLS REBUILD
-- Aligns helper functions and tenant isolation policies with:
-- owners.profile_id
-- company_users.profile_id
-- outlet_users.profile_id
-- profiles.id = auth.users.id

-- 1. Profiles are identity records, not the source of company authority anymore.
ALTER TABLE public.profiles
ALTER COLUMN company_id DROP NOT NULL;

-- 2. Canonical helper functions based on membership tables.
CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cu.company_id
  FROM public.company_users cu
  WHERE cu.profile_id = auth.uid()
  UNION
  SELECT DISTINCT o.company_id
  FROM public.owners o
  WHERE o.profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.get_my_company_ids()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_outlet_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ou.outlet_id
  FROM public.outlet_users ou
  WHERE ou.profile_id = auth.uid()
  UNION
  SELECT DISTINCT ot.id
  FROM public.outlets ot
  JOIN public.owners o
    ON o.company_id = ot.company_id
  WHERE o.profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_outlet_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.get_my_outlet_ids()
  LIMIT 1;
$$;

-- 2b. Align legacy role check constraints with the active role model.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF', 'ADMIN', 'INVESTOR'));

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.roles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.roles
ADD CONSTRAINT roles_role_check
CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF', 'ADMIN', 'INVESTOR'));

CREATE OR REPLACE FUNCTION public.can_access_company(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users cu
    WHERE cu.profile_id = auth.uid()
      AND cu.company_id = target_company_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.owners o
    WHERE o.profile_id = auth.uid()
      AND o.company_id = target_company_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.owners o
    WHERE o.profile_id = auth.uid()
      AND o.company_id = target_company_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_management(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_owner(target_company_id)
  OR EXISTS (
    SELECT 1
    FROM public.company_users cu
    WHERE cu.profile_id = auth.uid()
      AND cu.company_id = target_company_id
      AND cu.role IN ('OWNER', 'ADMIN', 'MANAGER')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_outlet(target_outlet_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.outlet_users ou
    WHERE ou.profile_id = auth.uid()
      AND ou.outlet_id = target_outlet_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.outlets ot
    JOIN public.owners o
      ON o.company_id = ot.company_id
    WHERE ot.id = target_outlet_id
      AND o.profile_id = auth.uid()
  );
$$;

-- 3. New user trigger should support profile_invites and owner-first signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT *
  INTO v_invite
  FROM public.profile_invites
  WHERE lower(email) = lower(new.email)
    AND accepted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.profiles (id, company_id, full_name, role, is_active)
  VALUES (
    new.id,
    v_invite.company_id,
    COALESCE(new.raw_user_meta_data->>'full_name', v_invite.full_name, ''),
    COALESCE(v_invite.role, 'OWNER'),
    TRUE
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    role = COALESCE(public.profiles.role, EXCLUDED.role),
    company_id = COALESCE(public.profiles.company_id, EXCLUDED.company_id),
    is_active = TRUE;

  IF v_invite.id IS NOT NULL THEN
    UPDATE public.profile_invites
    SET profile_id = new.id
    WHERE id = v_invite.id;
  END IF;

  RETURN new;
END;
$$;

-- 4. Remove stale policies from active auth and tenant tables.
DO $$
DECLARE
  rec RECORD;
  target_tables text[] := ARRAY[
    'companies',
    'profiles',
    'owners',
    'company_users',
    'outlet_users',
    'outlets',
    'roles',
    'role_permissions',
    'profile_invites',
    'menu_categories',
    'menu_items',
    'tables',
    'inventory',
    'inventory_batches',
    'inventory_ledger',
    'payment_modes',
    'orders',
    'invoices',
    'invoice_items',
    'kitchen_orders',
    'printers',
    'terminals',
    'staff_sessions',
    'suppliers',
    'purchase_orders',
    'purchase_items',
    'purchase_invoices',
    'ocr_invoice_results',
    'recipes',
    'ai_providers',
    'ai_forecasts',
    'ai_insights',
    'ai_recommendations',
    'alert_deliveries',
    'whatsapp_messages',
    'audit_logs',
    'security_logs',
    'delivery_partner_prices',
    'delivery_orders',
    'delivery_order_items',
    'food_cost_alerts',
    'restaurant_simulations',
    'inventory_aliases'
  ];
BEGIN
  FOR rec IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(target_tables)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
  END LOOP;
END $$;

-- 5. Core auth and membership policies.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_select_membership" ON public.companies
  FOR SELECT TO authenticated
  USING (public.can_access_company(id));
CREATE POLICY "companies_insert_self_owned" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "companies_update_management" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.is_company_management(id))
  WITH CHECK (public.is_company_management(id));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_self_or_company" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (company_id IS NOT NULL AND public.can_access_company(company_id))
  );
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self_or_management" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR (company_id IS NOT NULL AND public.is_company_management(company_id))
  )
  WITH CHECK (
    id = auth.uid()
    OR (company_id IS NOT NULL AND public.is_company_management(company_id))
  );

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners_select_owner_scope" ON public.owners
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.is_company_owner(company_id)
  );
CREATE POLICY "owners_manage_owner_scope" ON public.owners
  FOR ALL TO authenticated
  USING (public.is_company_owner(company_id))
  WITH CHECK (public.is_company_owner(company_id));

ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_users_select_membership" ON public.company_users
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.is_company_management(company_id)
  );
CREATE POLICY "company_users_manage_management" ON public.company_users
  FOR ALL TO authenticated
  USING (public.is_company_management(company_id))
  WITH CHECK (public.is_company_management(company_id));

ALTER TABLE public.outlet_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outlet_users_select_membership" ON public.outlet_users
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.can_access_outlet(outlet_id)
  );
CREATE POLICY "outlet_users_manage_management" ON public.outlet_users
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.outlets ot
      WHERE ot.id = outlet_users.outlet_id
        AND public.is_company_management(ot.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.outlets ot
      WHERE ot.id = outlet_users.outlet_id
        AND public.is_company_management(ot.company_id)
    )
  );

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select_company" ON public.roles
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.can_access_company(company_id));
CREATE POLICY "roles_manage_management" ON public.roles
  FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_management(company_id))
  WITH CHECK (company_id IS NOT NULL AND public.is_company_management(company_id));

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_select_company" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.can_access_company(company_id));
CREATE POLICY "role_permissions_manage_management" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.is_company_management(company_id))
  WITH CHECK (public.is_company_management(company_id));

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_select_authenticated" ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.profile_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile_invites_select_management" ON public.profile_invites
  FOR SELECT TO authenticated
  USING (public.is_company_management(company_id));
CREATE POLICY "profile_invites_manage_management" ON public.profile_invites
  FOR ALL TO authenticated
  USING (public.is_company_management(company_id))
  WITH CHECK (public.is_company_management(company_id));

ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outlets_select_company" ON public.outlets
  FOR SELECT TO authenticated
  USING (public.can_access_company(company_id));
CREATE POLICY "outlets_manage_management" ON public.outlets
  FOR ALL TO authenticated
  USING (public.is_company_management(company_id))
  WITH CHECK (public.is_company_management(company_id));

-- 6. Generic company-scoped RLS.
DO $$
DECLARE
  tbl text;
  company_tables text[] := ARRAY[
    'audit_logs',
    'security_logs',
    'suppliers',
    'purchase_invoices',
    'ai_providers',
    'inventory_aliases',
    'ocr_invoice_results',
    'alert_deliveries'
  ];
BEGIN
  FOREACH tbl IN ARRAY company_tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_access_company(company_id))',
      tbl || '_select_company_scope',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_access_company(company_id)) WITH CHECK (public.can_access_company(company_id))',
      tbl || '_write_company_scope',
      tbl
    );
  END LOOP;
END $$;

-- 7. Generic company + outlet scoped RLS.
DO $$
DECLARE
  tbl text;
  company_outlet_tables text[] := ARRAY[
    'menu_categories',
    'menu_items',
    'tables',
    'inventory',
    'inventory_batches',
    'inventory_ledger',
    'payment_modes',
    'orders',
    'invoices',
    'invoice_items',
    'kitchen_orders',
    'printers',
    'terminals',
    'staff_sessions',
    'purchase_orders',
    'purchase_items',
    'recipes',
    'ai_forecasts',
    'ai_insights',
    'ai_recommendations',
    'whatsapp_messages',
    'delivery_partner_prices',
    'delivery_orders',
    'delivery_order_items',
    'food_cost_alerts',
    'restaurant_simulations'
  ];
BEGIN
  FOREACH tbl IN ARRAY company_outlet_tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_access_company(company_id) AND public.can_access_outlet(outlet_id))',
      tbl || '_select_company_outlet_scope',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_access_company(company_id) AND public.can_access_outlet(outlet_id)) WITH CHECK (public.can_access_company(company_id) AND public.can_access_outlet(outlet_id))',
      tbl || '_write_company_outlet_scope',
      tbl
    );
  END LOOP;
END $$;

INSERT INTO public.schema_migrations (version, name)
VALUES (89, 'membership_rls_rebuild_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
