import { createClient } from '@supabase/supabase-js';
import { API_BASE } from './config';

/* ============================================================================
   SUPABASE CLIENT (RE-INITIALIZABLE)
============================================================================ */
const defaultUrl = import.meta.env.VITE_SUPABASE_URL;
const defaultAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!defaultUrl || !defaultAnonKey) {
  throw new Error('Missing frontend Supabase environment variables');
}

let supabaseClient = createClient(defaultUrl, defaultAnonKey);
export const getAuthSupabase = () => supabaseClient;

export const getAdminSupabase = () => {
  throw new Error('Service-role access is blocked in the frontend. Use the backend central authority instead.');
};



const PROFILE_CACHE_TTL_MS = 60 * 1000;
let profileCache: {
  key: string;
  profile: any;
  fetchedAt: number;
} | null = null;

const invalidateProfileCache = () => {
  profileCache = null;
};

export const initSupabase = (url: string, key: string) => {
  if (key.includes('service_role')) {
    throw new Error('SECURITY ERROR: Service role key cannot be used in frontend');
  }

  supabaseClient = createClient(url, key);
  invalidateProfileCache();
  console.log("Supabase initialized (frontend safe)");
};

type QueryFilterOperator = 'eq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'contains' | 'is';

type QueryFilter = {
  operator: QueryFilterOperator;
  column: string;
  value: any;
};

const isDefinedQueryValue = (value: any) => value !== undefined;

type QueryOrder = {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
  foreignTable?: string;
};

async function executeCentralQuery(payload: Record<string, any>) {
  const response = await fetch(`${API_BASE}/api/data/query`, {
    method: 'POST',
    headers: await getTenantAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    return {
      data: null,
      error: result?.error || { message: 'Central query failed' },
      count: null,
    };
  }

  return result;
}

async function executeCentralRpc(fn: string, args: Record<string, any>) {
  const response = await fetch(`${API_BASE}/api/data/rpc`, {
    method: 'POST',
    headers: await getTenantAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fn, args }),
  });

  const result = await response.json();

  if (!response.ok) {
    return {
      data: null,
      error: result?.error || { message: 'Central RPC failed' },
    };
  }

  return result;
}

class CentralQueryBuilder {
  private readonly table: string;
  private operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectClause = '*';
  private selectOptions: Record<string, any> | undefined;
  private returningSelectClause: string | null = null;
  private returningSelectOptions: Record<string, any> | undefined;
  private mutationOptions: Record<string, any> | undefined;
  private values: any = null;
  private filters: QueryFilter[] = [];
  private orderBy: QueryOrder[] = [];
  private maxRows: number | undefined;
  private resultMode: 'single' | 'maybeSingle' | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*', options?: Record<string, any>) {
    if (this.operation === 'select' && this.values === null) {
      this.operation = 'select';
      this.selectClause = columns;
      this.selectOptions = options;
    } else {
      this.returningSelectClause = columns;
      this.returningSelectOptions = options;
    }
    return this;
  }

  insert(values: any, options?: Record<string, any>) {
    this.operation = 'insert';
    this.values = values;
    this.mutationOptions = options;
    return this;
  }

  update(values: any, options?: Record<string, any>) {
    this.operation = 'update';
    this.values = values;
    this.mutationOptions = options;
    return this;
  }

  upsert(values: any, options?: Record<string, any>) {
    this.operation = 'upsert';
    this.values = values;
    this.mutationOptions = options;
    return this;
  }

  delete(options?: Record<string, any>) {
    this.operation = 'delete';
    this.mutationOptions = options;
    return this;
  }

  eq(column: string, value: any) {
    if (!isDefinedQueryValue(value)) return this;
    this.filters.push({ operator: 'eq', column, value });
    return this;
  }

  in(column: string, value: any[]) {
    const normalized = Array.isArray(value) ? value.filter(isDefinedQueryValue) : [];
    if (!normalized.length) return this;
    this.filters.push({ operator: 'in', column, value: normalized });
    return this;
  }

  gt(column: string, value: any) {
    if (!isDefinedQueryValue(value)) return this;
    this.filters.push({ operator: 'gt', column, value });
    return this;
  }

  gte(column: string, value: any) {
    if (!isDefinedQueryValue(value)) return this;
    this.filters.push({ operator: 'gte', column, value });
    return this;
  }

  lt(column: string, value: any) {
    if (!isDefinedQueryValue(value)) return this;
    this.filters.push({ operator: 'lt', column, value });
    return this;
  }

  lte(column: string, value: any) {
    if (!isDefinedQueryValue(value)) return this;
    this.filters.push({ operator: 'lte', column, value });
    return this;
  }

  ilike(column: string, value: any) {
    if (!isDefinedQueryValue(value)) return this;
    this.filters.push({ operator: 'ilike', column, value });
    return this;
  }

  contains(column: string, value: any) {
    if (!isDefinedQueryValue(value)) return this;
    this.filters.push({ operator: 'contains', column, value });
    return this;
  }

  is(column: string, value: any) {
    if (!isDefinedQueryValue(value)) return this;
    this.filters.push({ operator: 'is', column, value });
    return this;
  }

  order(column: string, options?: Record<string, any>) {
    this.orderBy.push({
      column,
      ascending: options?.ascending,
      nullsFirst: options?.nullsFirst,
      foreignTable: options?.foreignTable,
    });
    return this;
  }

  limit(value: number) {
    this.maxRows = value;
    return this;
  }

  single() {
    this.resultMode = 'single';
    return this;
  }

  maybeSingle() {
    this.resultMode = 'maybeSingle';
    return this;
  }

  private execute() {
    return executeCentralQuery({
      table: this.table,
      operation: this.operation,
      select: this.selectClause,
      selectOptions: this.selectOptions,
      returningSelect: this.returningSelectClause,
      returningSelectOptions: this.returningSelectOptions,
      mutationOptions: this.mutationOptions,
      values: this.values,
      filters: this.filters,
      orderBy: this.orderBy,
      limit: this.maxRows,
      resultMode: this.resultMode,
    });
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ) {
    return this.execute().catch(onrejected as any);
  }

  finally(onfinally?: (() => void) | null) {
    return this.execute().finally(onfinally as any);
  }
}

const centralDataClient = {
  get auth() {
    return supabaseClient.auth;
  },
  from(table: string) {
    return new CentralQueryBuilder(table);
  },
  rpc(fn: string, args: Record<string, any> = {}) {
    return executeCentralRpc(fn, args);
  },
};

export const getSupabase = () => centralDataClient;



export const testConnection = async (url: string, key: string) => {
  const client = createClient(url, key);
  const { error } = await client.from('profiles').select('id').limit(1);
  if (error) return { success: false, message: error.message };
  return { success: true };
};

/* ============================================================================
   TENANT CONTEXT (🔥 SINGLE SOURCE OF TRUTH)
   ❗ NO SERVICE MAY BYPASS THIS
============================================================================ */
export const tenantContext = {
  get() {
    const session = localStorage.getItem('papapos_session');
    if (!session) return null;
    try {
      return JSON.parse(session);
    } catch (e) {
      return null;
    }
  },

  set(company_id: string, outlet_id: string | null, role?: string | null) {
    const session = this.get() || {};
    localStorage.setItem('papapos_session', JSON.stringify({
      ...session,
      company_id,
      outlet_id,
      role: role || null
    }));
    invalidateProfileCache();
  },

  async require() {
    const ctx = this.get();
    if (ctx && ctx.company_id) {
      return ctx;
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    try {
      const access = await authService.getAccess();
      if (access?.company_id) {
        const resolved = {
          user_id: access.profile_id || access.user_id || user.id,
          company_id: access.company_id,
          outlet_id: access.outlet_id || null
        };

        this.set(resolved.company_id, resolved.outlet_id, access.role || null);
        return resolved;
      }
    } catch (error) {
      console.warn("Tenant access fallback engaged", error);
    }

    // Fallback to profile for legacy support
    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !profile?.company_id) {
      throw new Error('TENANT VIOLATION: company_id missing');
    }

    return {
      user_id: profile.id,
      company_id: profile.company_id,
      outlet_id: profile.outlet_id || null
    };
  }
};

/* ============================================================================
   COMPANY SERVICE
============================================================================ */
export const companyService = {
  async fetchUserCompanies() {
    const response = await fetch(`${API_BASE}/api/tenant/companies`, {
      headers: await getTenantAuthHeaders(),
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Failed to fetch companies');
    return data || [];
  },

  async createCompany(name: string, passedUser?: any) {
    // passedUser may be either a user object or a raw access token string (fallback after signup)
    const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
    const isTokenString = typeof passedUser === 'string' && passedUser.length > 0;
    const user = isTokenString ? currentUser : (passedUser || currentUser);

    if (!user && !isTokenString) throw new Error("Unauthorized: No user found for company creation");

    // Attempt to build tenant auth headers from session; if that fails and a token was provided,
    // fallback to using the provided token directly.
    let headers: Record<string, string> | null = null;
    try {
      headers = await getTenantAuthHeaders({ 'Content-Type': 'application/json' });
    } catch (err) {
      if (isTokenString) {
        headers = { Authorization: `Bearer ${passedUser}`, 'Content-Type': 'application/json' };
      }
    }

    if (!headers) {
      throw new Error('Authentication required');
    }

    // Debug: log headers and passedUser to help diagnose missing Authorization
    try {
      console.log('[COMPANY SERVICE] createCompany headers:', headers);
      console.log('[COMPANY SERVICE] createCompany passedUser:', passedUser);
    } catch (e) {
      // ignore logging errors in constrained environments
    }

    const response = await fetch(`${API_BASE}/api/setup/company`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create company');
    }

    invalidateProfileCache();
    return result.company;
  }
};

/* ============================================================================
   OUTLET SERVICE
============================================================================ */
export const outletService = {
  async fetchByCompany(companyId: string) {
    const { data, error } = await getSupabase()
      .from('outlets')
      .select('*')
      .eq('company_id', companyId);

    if (error) throw error;
    return data || [];
  }
};

/* ============================================================================
   AUTH SERVICE
============================================================================ */
export const authService = {
  async getCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  },

  async getAccess() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return null;

    const headers = await getTenantAuthHeaders();

    const response = await fetch(`${API_BASE}/api/access`, { headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to resolve access");
    }

    return data;
  },

  async getProfile() {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return null;

    const ctx = tenantContext.get();
    const cacheKey = `${user.id}:${ctx?.company_id || 'none'}:${ctx?.outlet_id || 'none'}`;
    if (
      profileCache &&
      profileCache.key === cacheKey &&
      Date.now() - profileCache.fetchedAt < PROFILE_CACHE_TTL_MS
    ) {
      return profileCache.profile;
    }
    
    const access = await this.getAccess();

    let profile: any = null;
    try {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      profile = data || null;
    } catch (error: any) {
      const message = String(error?.message || '');
      if (!message.includes('Access denied for operation select')) {
        throw error;
      }
    }

    // Fetch company details if context exists
    let companyData = null;
    const activeCompanyId = access?.company_id || ctx?.company_id || profile?.company_id;

    if (activeCompanyId) {
      const { data: company } = await getSupabase()
        .from('companies')
        .select('*')
        .eq('id', activeCompanyId)
        .single();
      companyData = company;
    }

    const mergedProfile = {
      ...(profile || {}),
      id: profile?.id || user.id,
      full_name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Staff',
      company_id: access?.company_id || ctx?.company_id || profile?.company_id || null,
      outlet_id: access?.outlet_id || ctx?.outlet_id || profile?.outlet_id || null,
      email: user.email,
      user_id: profile?.id || user.id,
      profile_id: profile?.id || user.id,
      role: access?.role || profile?.role || 'CASHIER',
      permissions: access?.permissions || {},
      is_owner: Boolean(access?.is_owner),
      outlets: access?.outlets || [],
      access,
      companies: companyData || profile?.companies || null
    };

    profileCache = {
      key: cacheKey,
      profile: mergedProfile,
      fetchedAt: Date.now()
    };

    return mergedProfile;
  },

  clearProfileCache() {
    invalidateProfileCache();
  },

  async createCompany(name: string, passedUser?: any) {
    console.log("[AUTH SERVICE] createCompany called with name:", name, "passedUser:", passedUser);
    return companyService.createCompany(name, passedUser);
  }
};

export async function getTenantAuthHeaders(extraHeaders?: Record<string, string>) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session) {
    throw new Error("Authentication required");
  }

  const ctx = tenantContext.get();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    ...extraHeaders,
  };

  if (ctx?.company_id) {
    headers["x-company-id"] = ctx.company_id;
  }

  if (ctx?.outlet_id) {
    headers["x-outlet-id"] = ctx.outlet_id;
  }

  return headers;
}

/* ============================================================================
   OUTLETS (🔥 FIXED – COMPANY ENFORCED)
============================================================================ */
export const cloudOutlets = {
  async fetchAll() {
    const { company_id } = await tenantContext.require();

    const { data, error } = await getSupabase()
      .from('outlets')
      .select('*')
      .eq('company_id', company_id);

    if (error) throw new Error(error.message);
    return data || [];
  },

  async upsert(outlet: any) {
    const { company_id, user_id } = await tenantContext.require();

    const { error } = await getSupabase()
      .from('outlets')
      .upsert({
        ...outlet,
        id: String(outlet.id),
        company_id:company_id,                  // 🔒 ENFORCED
        updated_by: user_id,
        updated_at: new Date().toISOString()
      });

    if (error) throw new Error(error.message);
  },

  async delete(id: string) {
    const { company_id } = await tenantContext.require();

    const { error } = await getSupabase()
      .from('outlets')
      .delete()
      .eq('id', String(id))
      .eq('company_id', company_id); // 🔒 SAFETY FILTER

    if (error) throw new Error(error.message);
  }
};

/* ============================================================================
   MENU SERVICE (COMPANY + OUTLET HARD LOCKED)
============================================================================ */
export const menuService = {
  async fetchCategories(outlet_id?: string) {
    const { company_id } = await tenantContext.require();

    let query = getSupabase()
      .from('menu_categories')
      .select('*')
      .eq('company_id', company_id);

    if (outlet_id) {
      query = query.eq('outlet_id', outlet_id);
    }

    const { data, error } = await query.order('sort_order');

    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchItems(outlet_id?: string) {
    const { company_id } = await tenantContext.require();

    // Fetch items together with their category metadata (including category modifiers)
    let query = getSupabase()
      .from('menu_items')
      .select('*, menu_categories(name, modifiers)')
      .eq('company_id', company_id);

    if (outlet_id) {
      query = query.eq('outlet_id', outlet_id);
    }

    const { data, error } = await query;
    console.log("MENU_SERVICE: FETCH_ITEMS_RESPONSE", data);

    if (error) throw new Error(error.message);

    // Merge category-level modifiers into item modifiers unless the item opts out
    const items = (data || []).map((item: any) => {
      const categoryMods = item.menu_categories?.modifiers || [];
      const itemMods = item.modifiers || [];
    
      const applyCategory = (typeof item.apply_category_modifiers === 'boolean') ? item.apply_category_modifiers : true;

      // Merge modifiers
      let finalModifiers = itemMods;
      if (applyCategory) {
        const mergedById: Record<string, any> = {};
        (categoryMods || []).forEach((m: any) => { if (m?.id) mergedById[m.id] = m; });
        (itemMods || []).forEach((m: any) => { if (m?.id) mergedById[m.id] = m; });
        finalModifiers = Object.values(mergedById);
      }

      // Apply category tax to items when configured and when item allows it
      const categoryTax = item.menu_categories?.tax_percentage;
      const itemTax = item.tax_percentage
      const applyCategoryTax = (typeof item.apply_category_tax === 'boolean') ? item.apply_category_tax : true;
      const categoryAppliesTax = Boolean(item.menu_categories?.apply_tax_to_items);

      let finalTax = itemTax;
      if (categoryAppliesTax && applyCategoryTax) {
        // If item does not have explicit tax, inherit category tax
        if (finalTax === undefined || finalTax === null) {
          finalTax = categoryTax !== undefined ? Number(categoryTax) : finalTax;
        }
      }

      return { ...item, modifiers: finalModifiers, tax_percentage: finalTax };
    });

    return items;
  },

  async fetchTables(outlet_id: string) {
    const { company_id } = await tenantContext.require();
    const { data, error } = await getSupabase()
      .from('tables')
      .select('*')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id);
    if (error) throw error;
    return data || [];
  },

  async saveCategory(category: any) {
    const { company_id } = await tenantContext.require();
    const { data, error } = await getSupabase()
      .from('menu_categories')
      .upsert({ ...category, company_id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async saveItem(item: any) {
    const { company_id, user_id } = await tenantContext.require();

    const { data, error } = await getSupabase()
      .from('menu_items')
      .upsert({
        ...item,
        company_id:company_id,          // 🔒
        created_by: user_id,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
};

/* ============================================================================
   INVENTORY (STRICT TENANT + OUTLET)
============================================================================ */
export const inventoryService = {
  async fetchBatches(outlet_id: string) {
    const { company_id } = await tenantContext.require();
    // FIX START
    const { data, error } = await getSupabase()
      .from('inventory_batches')
      .select('*, inventory(name)')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id);
    
    if (data) {
      data.forEach((b: any) => {
        b.inventory_id = b.item_id; // 🔒 Preserve ID
        b.item_name = b.inventory?.name || 'Unknown'; // Display Metadata
        if (b.inventory?.name) b.item_id = b.inventory.name; // UI Compatibility
      });
    }
    // FIX END
    if (error) throw error;
    return data || [];
  },

  async fetchLedger(outlet_id: string) {
    const { company_id } = await tenantContext.require();

    // FIX START
    const { data, error } = await getSupabase()
      .from('inventory_ledger')
      .select('*, inventory(name)')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id)
      .order('created_at', { ascending: false });

    if (data) {
      data.forEach((l: any) => {
        l.inventory_id = l.item_id; // 🔒 Preserve ID
        l.item_name = l.inventory?.name || 'Unknown'; // Display Metadata
        if (l.inventory?.name) l.item_id = l.inventory.name; // UI Compatibility
      });
    }
    // FIX END

    if (error) throw new Error(error.message);
    return data || [];
  },

  async record(payload: any) {
    const { company_id, user_id } = await tenantContext.require();
    if (!payload.outlet_id) {
      throw new Error('Safety Block: outlet_id missing');
    }

    // FIX START: Resolve Item ID if name is passed
    let resolvedItemId = payload.item_id;
    if (resolvedItemId && !resolvedItemId.startsWith('INV-')) {
      const { data: inv } = await getSupabase()
        .from('inventory')
        .select('id')
        .eq('company_id', company_id)
        .eq('outlet_id', payload.outlet_id)
        .ilike('name', resolvedItemId)
        .maybeSingle();
      if (inv) resolvedItemId = inv.id;
    }

    // 1. Insert into Ledger
    const { error: ledgerError } = await getSupabase()
      .from('inventory_ledger')
      .insert({
        ...payload,
        item_id: resolvedItemId,
        company_id,            // 🔒
        created_by: user_id,
        user_id: user_id,      // Ensure user_id is set for audit
        created_at: new Date().toISOString()
      });

    if (ledgerError) throw new Error(ledgerError.message);

    // 2. If batch_id is present, update the batch quantity
    if (payload.batch_id && payload.qty_change !== undefined) {
      const { data: batch, error: fetchError } = await getSupabase()
        .from('inventory_batches')
        .select('current_qty')
        .eq('id', payload.batch_id)
        .single();
      
      if (!fetchError && batch) {
        const newQty = Number(batch.current_qty) + Number(payload.qty_change);
        await getSupabase()
          .from('inventory_batches')
          .upsert({ 
            id: payload.batch_id, 
            current_qty: newQty, 
            updated_at: new Date().toISOString() 
          });
      }
    }
  },

  async recordStockIn(payload: any) {
    const { qty, ...rest } = payload;
    return this.record({ ...rest, qty_change: qty, transaction_type: 'STOCK_IN' });
  },

  async recordWastage(payload: any) {
    const { qty, ...rest } = payload;
    return this.record({ ...rest, qty_change: -qty, transaction_type: 'WASTAGE' });
  },

  async recordAdjustment(payload: any) {
    const { qty, ...rest } = payload;
    return this.record({ ...rest, qty_change: qty, transaction_type: 'ADJUSTMENT' });
  },

  async deductStock(itemId: string, outletId: string, qtyToDeduct: number, reason: string = 'SALE', reference?: { type: string, id: string }) {
    const { company_id, user_id } = await tenantContext.require();
    
    // 1. Resolve Item ID if name is passed
    let resolvedItemId = itemId;
    if (resolvedItemId && !resolvedItemId.startsWith('INV-')) {
      const { data: inv } = await getSupabase()
        .from('inventory')
        .select('id')
        .eq('company_id', company_id)
        .eq('outlet_id', outletId)
        .ilike('name', resolvedItemId)
        .maybeSingle();
      if (inv) resolvedItemId = inv.id;
    }

    // 2. Fetch active batches for this item, ordered by FIFO (created_at)
    const { data: batches, error: fetchError } = await getSupabase()
      .from('inventory_batches')
      .select('*')
      .eq('company_id', company_id)
      .eq('outlet_id', outletId)
      .eq('item_id', resolvedItemId)
      .gt('current_qty', 0)
      .order('created_at', { ascending: true });

    if (fetchError) throw new Error(fetchError.message);
    
    // If no batches found, we still record a negative entry in the ledger to maintain accuracy
    if (!batches || batches.length === 0) {
      console.warn(`[INVENTORY] No stock available for ${resolvedItemId} in ${outletId}. Recording negative ledger entry.`);
      await this.record({
        outlet_id: outletId,
        item_id: resolvedItemId,
        transaction_type: 'STOCK_OUT',
        qty_change: -qtyToDeduct,
        balance_after: (await this.getTotalStock(resolvedItemId, outletId)) - qtyToDeduct,
        reason: reason,
        reference_type: reference?.type,
        reference_id: reference?.id
      });
      return;
    }

    let remainingToDeduct = qtyToDeduct;

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;

      const deduction = Math.min(batch.current_qty, remainingToDeduct);
      const newQty = batch.current_qty - deduction;

      // Update Batch
      const { error: updateError } = await getSupabase()
        .from('inventory_batches')
        .upsert({ 
          id: batch.id, 
          current_qty: newQty, 
          updated_at: new Date().toISOString() 
        });

      if (updateError) throw new Error(updateError.message);

      // Record in Ledger
      await this.record({
        outlet_id: outletId,
        item_id: resolvedItemId,
        batch_id: batch.id,
        transaction_type: reason === 'SALE' ? 'SALE' : 'STOCK_OUT',
        qty_change: -deduction,
        balance_after: (await this.getTotalStock(resolvedItemId, outletId)),
        reason: reason,
        reference_type: reference?.type,
        reference_id: reference?.id
      });

      remainingToDeduct -= deduction;
    }

    if (remainingToDeduct > 0) {
       // Record the remaining deficit
       await this.record({
        outlet_id: outletId,
        item_id: resolvedItemId,
        transaction_type: 'STOCK_OUT',
        qty_change: -remainingToDeduct,
        balance_after: (await this.getTotalStock(resolvedItemId, outletId)),
        reason: `${reason} (Deficit)`,
        reference_type: reference?.type,
        reference_id: reference?.id
      });
    }
  },

  async getTotalStock(itemId: string, outletId: string): Promise<number> {
    const { company_id } = await tenantContext.require();
    
    // Resolve Item ID if name is passed
    let resolvedItemId = itemId;
    if (resolvedItemId && !resolvedItemId.startsWith('INV-')) {
      const { data: inv } = await getSupabase()
        .from('inventory')
        .select('id')
        .eq('company_id', company_id)
        .eq('outlet_id', outletId)
        .ilike('name', resolvedItemId)
        .maybeSingle();
      if (inv) resolvedItemId = inv.id;
    }

    const { data, error } = await getSupabase()
      .from('inventory_ledger')
      .select('qty_change')
      .eq('company_id', company_id)
      .eq('outlet_id', outletId)
      .eq('item_id', resolvedItemId);
    
    if (error) throw error;
    return (data || []).reduce((sum, l) => sum + Number(l.qty_change), 0);
  },

  async fetchAggregatedStock(outletId: string) {
    const { company_id } = await tenantContext.require();
    const { data, error } = await getSupabase()
      .from('inventory_ledger')
      .select('item_id, qty_change')
      .eq('company_id', company_id)
      .eq('outlet_id', outletId);
    
    if (error) throw error;
    
    const map: Record<string, number> = {};
    (data || []).forEach(l => {
      map[l.item_id] = (map[l.item_id] || 0) + Number(l.qty_change);
    });
    
    return map;
  },

  async getWeightedAverageCost(itemId: string, outletId: string): Promise<number> {
    const { company_id } = await tenantContext.require();
    const { data, error } = await getSupabase()
      .from('inventory_batches')
      .select('current_qty, cost_price')
      .eq('company_id', company_id)
      .eq('outlet_id', outletId)
      .eq('item_id', itemId)
      .gt('current_qty', 0);
    
    if (error) throw error;
    if (!data || data.length === 0) return 0;

    const totalQty = data.reduce((sum, b) => sum + Number(b.current_qty), 0);
    const totalValue = data.reduce((sum, b) => sum + (Number(b.current_qty) * Number(b.cost_price || 0)), 0);

    return totalQty > 0 ? totalValue / totalQty : 0;
  }
};

/* ============================================================================
   INVENTORY MASTER (SKU MANAGEMENT)
============================================================================ */
export const inventoryMasterService = {
  async fetchAll(outlet_id: string) {
    const { company_id } = await tenantContext.require();

    const { data, error } = await getSupabase()
      .from('inventory')
      .select('*')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id)
      .order('name');

    if (error) throw new Error(error.message);
    return data || [];
  },

  async save(item: any) {
    const { company_id, user_id } = await tenantContext.require();

    const payload = {
      ...item,
      company_id,
      outlet_id: item.outlet_id,
      created_by: user_id,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await getSupabase()
      .from('inventory')
      .upsert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id: string, outlet_id: string) {
    const { company_id } = await tenantContext.require();

    const { error } = await getSupabase()
      .from('inventory')
      .delete()
      .eq('id', id)
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id);

    if (error) throw new Error(error.message);
  }
};

/* ============================================================================
   PAYMENT MODES (OUTLET + COMPANY)
============================================================================ */
export const paymentService = {
  async fetchActiveModes(outlet_id: string) {
    const { company_id } = await tenantContext.require();

    const { data, error } = await getSupabase()
      .from('payment_modes')
      .select('*')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id)
      .eq('is_active', true)
      .order('priority_order');

    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchDefaultMode(outlet_id: string) {
    const { company_id } = await tenantContext.require();
    const { data, error } = await getSupabase()
      .from('payment_modes')
      .select('*')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id)
      .eq('is_default', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
};

/* ============================================================================
   TEAM / ROLES (ORG LEVEL)
============================================================================ */
export const roleService = {
  async fetchTeam() {
    const { company_id } = await tenantContext.require();

    const { data, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('company_id', company_id);

    if (error) throw new Error(error.message);
    return data || [];
  }
};
