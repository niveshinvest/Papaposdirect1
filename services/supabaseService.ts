import { createClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../lib/supabaseClient';

/* ============================================================================
   SUPABASE CLIENT (RE-INITIALIZABLE)
============================================================================ */
let supabaseClient = defaultClient;
export const getSupabase = () => supabaseClient;
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
  supabaseClient = createClient(url, key);
  invalidateProfileCache();
};

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

  set(company_id: string, outlet_id: string | null, role: string) {
    const session = this.get() || {};
    localStorage.setItem('papapos_session', JSON.stringify({
      ...session,
      company_id,
      outlet_id,
      role
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

    // Fallback to profile for legacy support
    const { data: profile, error } = await supabaseClient
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
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabaseClient
      .from('company_users')
      .select('*, companies(*)')
      .eq('user_id', user.id);

    if (error) throw error;
    return data || [];
  },

  async createCompany(name: string, passedUser?: any) {
    const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
    const user = passedUser || currentUser;
    
    if (!user) throw new Error("Unauthorized: No user found for company creation");

    const { data: company, error: cError } = await supabaseClient
      .from('companies')
      .insert({ name })
      .select().single();

    if (cError) throw cError;

    const { error: cuError } = await supabaseClient.from('company_users').insert({ 
      user_id: user.id,
      company_id: company.id, 
      role: 'OWNER'
    });

    if (cuError) throw cuError;

    // Update user profile with the new company_id
    await supabaseClient
      .from('profiles')
      .update({ company_id: company.id })
      .eq('id', user.id);

    // Create default outlet
    await supabaseClient.from('outlets').insert({
      id: `main-${company.id.slice(0, 8)}`,
      company_id: company.id,
      name: 'Main Outlet'
    });

    return company;
  }
};

/* ============================================================================
   OUTLET SERVICE
============================================================================ */
export const outletService = {
  async fetchByCompany(companyId: string) {
    const { data, error } = await supabaseClient
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

  async getProfile() {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return null;

    const ctx = tenantContext.get();
    const cacheKey = `${user.id}:${ctx?.company_id || 'none'}:${ctx?.outlet_id || 'none'}:${ctx?.role || 'none'}`;
    if (
      profileCache &&
      profileCache.key === cacheKey &&
      Date.now() - profileCache.fetchedAt < PROFILE_CACHE_TTL_MS
    ) {
      return profileCache.profile;
    }
    
    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Fetch company details if context exists
    let companyData = null;
    if (ctx?.company_id) {
      const { data: company } = await supabaseClient
        .from('companies')
        .select('*')
        .eq('id', ctx.company_id)
        .single();
      companyData = company;
    }

    const mergedProfile = {
      ...profile,
      company_id: ctx?.company_id || profile.company_id,
      outlet_id: ctx?.outlet_id || profile.outlet_id,
      email: user.email,
      user_id: profile.id,
      role: ctx?.role || profile.role,
      companies: companyData || profile.companies
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
    return companyService.createCompany(name, passedUser);
  }
};

/* ============================================================================
   OUTLETS (🔥 FIXED – COMPANY ENFORCED)
============================================================================ */
export const cloudOutlets = {
  async fetchAll() {
    const { company_id } = await tenantContext.require();

    const { data, error } = await supabaseClient
      .from('outlets')
      .select('*')
      .eq('company_id', company_id);

    if (error) throw new Error(error.message);
    return data || [];
  },

  async upsert(outlet: any) {
    const { company_id, user_id } = await tenantContext.require();

    const { error } = await supabaseClient
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

    const { error } = await supabaseClient
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

    let query = supabaseClient
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

    let query = supabaseClient
      .from('menu_items')
      .select('*, menu_categories(name)')
      .eq('company_id', company_id);

    if (outlet_id) {
      query = query.eq('outlet_id', outlet_id);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchTables(outlet_id: string) {
    const { company_id } = await tenantContext.require();
    const { data, error } = await supabaseClient
      .from('tables')
      .select('*')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id);
    if (error) throw error;
    return data || [];
  },

  async saveCategory(category: any) {
    const { company_id } = await tenantContext.require();
    const { data, error } = await supabaseClient
      .from('menu_categories')
      .upsert({ ...category, company_id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async saveItem(item: any) {
    const { company_id, user_id } = await tenantContext.require();

    const { data, error } = await supabaseClient
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
    const { data, error } = await supabaseClient
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
    const { data, error } = await supabaseClient
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
      const { data: inv } = await supabaseClient
        .from('inventory')
        .select('id')
        .eq('company_id', company_id)
        .eq('outlet_id', payload.outlet_id)
        .ilike('name', resolvedItemId)
        .maybeSingle();
      if (inv) resolvedItemId = inv.id;
    }

    // 1. Insert into Ledger
    const { error: ledgerError } = await supabaseClient
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
      const { data: batch, error: fetchError } = await supabaseClient
        .from('inventory_batches')
        .select('current_qty')
        .eq('id', payload.batch_id)
        .single();
      
      if (!fetchError && batch) {
        const newQty = Number(batch.current_qty) + Number(payload.qty_change);
        await supabaseClient
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
      const { data: inv } = await supabaseClient
        .from('inventory')
        .select('id')
        .eq('company_id', company_id)
        .eq('outlet_id', outletId)
        .ilike('name', resolvedItemId)
        .maybeSingle();
      if (inv) resolvedItemId = inv.id;
    }

    // 2. Fetch active batches for this item, ordered by FIFO (created_at)
    const { data: batches, error: fetchError } = await supabaseClient
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
      const { error: updateError } = await supabaseClient
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
      const { data: inv } = await supabaseClient
        .from('inventory')
        .select('id')
        .eq('company_id', company_id)
        .eq('outlet_id', outletId)
        .ilike('name', resolvedItemId)
        .maybeSingle();
      if (inv) resolvedItemId = inv.id;
    }

    const { data, error } = await supabaseClient
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
    const { data, error } = await supabaseClient
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
    const { data, error } = await supabaseClient
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

    const { data, error } = await supabaseClient
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

    const { data, error } = await supabaseClient
      .from('inventory')
      .upsert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id: string, outlet_id: string) {
    const { company_id } = await tenantContext.require();

    const { error } = await supabaseClient
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

    const { data, error } = await supabaseClient
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
    const { data, error } = await supabaseClient
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

    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('company_id', company_id);

    if (error) throw new Error(error.message);
    return data || [];
  }
};
