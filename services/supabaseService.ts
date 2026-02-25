import { createClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../lib/supabaseClient';

/* ============================================================================
   SUPABASE CLIENT (RE-INITIALIZABLE)
============================================================================ */
let supabaseClient = defaultClient;
export const getSupabase = () => supabaseClient;

export const initSupabase = (url: string, key: string) => {
  supabaseClient = createClient(url, key);
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
  async require() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');

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
   AUTH SERVICE
============================================================================ */
export const authService = {
  async getCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  },

  async getProfile() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*, companies(*)')
      .eq('id', user.id)
      .single();

    if (error) return null;
    return {
      ...profile,
      email: user.email,
      user_id: profile.id // for backward compatibility with tenantContext
    };
  },

  async createCompany(name: string, passedUser?: any) {
    const user = passedUser || await this.getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const { data: company, error: cError } = await supabaseClient
      .from('companies')
      .insert({ name, owner_id: user.id })
      .select().single();

    if (cError) throw cError;

    const { error: pError } = await supabaseClient.from('profiles').upsert({ 
      id: user.id,
      company_id: company.id, 
      role: 'OWNER'
    });

    if (pError) throw pError;
    return company;
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
        company_id,                  // 🔒 ENFORCED
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
        company_id,          // 🔒
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
    const { data, error } = await supabaseClient
      .from('inventory_batches')
      .select('*')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id);
    if (error) throw error;
    return data || [];
  },

  async fetchLedger(outlet_id: string) {
    const { company_id } = await tenantContext.require();

    const { data, error } = await supabaseClient
      .from('inventory_ledger')
      .select('*')
      .eq('company_id', company_id)
      .eq('outlet_id', outlet_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async record(payload: any) {
    const { company_id, user_id } = await tenantContext.require();
    if (!payload.outlet_id) {
      throw new Error('Safety Block: outlet_id missing');
    }

    const { error } = await supabaseClient
      .from('inventory_ledger')
      .insert({
        ...payload,
        company_id,            // 🔒
        created_by: user_id,
        created_at: new Date().toISOString()
      });

    if (error) throw new Error(error.message);
  },

  async recordStockIn(payload: any) {
    const { qty, ...rest } = payload;
    return this.record({ ...rest, qty_change: qty, transaction_type: 'STOCK_IN' });
  },

  async recordWastage(payload: any) {
    const { qty, ...rest } = payload;
    return this.record({ ...rest, qty_change: -qty, transaction_type: 'WASTAGE' });
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