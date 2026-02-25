import { createClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../lib/supabaseClient';

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

/* ===============================
   AUTH & TENANT CONTEXT
================================ */
export const authService = {
  async getCurrentUser() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.user || null;
  },

  async getProfile() {
    const user = await this.getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  }
};

/* ===============================
   MENU SERVICE (COMPANY + OUTLET)
================================ */
export const menuService = {
  async fetchCategories(outletId: string) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const { data, error } = await supabaseClient
      .from('menu_categories')
      .select('*')
      .eq('company_id', profile.company_id)     // 🔒 ADDED
      .eq('outlet_id', outletId)                 // 🔒 ADDED
      .order('sort_order');

    if (error) throw error;
    return data || [];
  },

  async fetchItems(outletId: string) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const { data, error } = await supabaseClient
      .from('menu_items')
      .select('*, menu_categories(name)')
      .eq('company_id', profile.company_id)     // 🔒 ADDED
      .eq('outlet_id', outletId);               // 🔒 ADDED

    if (error) throw error;
    return data || [];
  },

  async saveCategory(category: any) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const payload = {
      ...category,
      company_id: profile.company_id,           // 🔒 ADDED
      outlet_id: category.outlet_id
    };

    const { data, error } = await supabaseClient
      .from('menu_categories')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async saveItem(item: any) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const payload = {
      ...item,
      company_id: profile.company_id,            // 🔒 ADDED
      outlet_id: item.outlet_id,
      created_by: profile.id
    };

    const { data, error } = await supabaseClient
      .from('menu_items')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

/* ===============================
   OUTLETS (COMPANY SCOPED)
================================ */
export const cloudOutlets = {
  async fetchAll() {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const { data, error } = await supabaseClient
      .from('outlets')
      .select('*')
      .eq('company_id', profile.company_id);   // 🔒 ADDED

    if (error) throw error;
    return data;
  },

  async upsert(outletData: any) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const payload = {
      ...outletData,
      company_id: profile.company_id            // 🔒 ADDED
    };

    const { error } = await supabaseClient
      .from('outlets')
      .upsert(payload);

    if (error) throw error;
  },

  async delete(id: string) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const { error } = await supabaseClient
      .from('outlets')
      .delete()
      .eq('id', id)
      .eq('company_id', profile.company_id);    // 🔒 ADDED

    if (error) throw error;
  }
};

/* ===============================
   INVENTORY (STRICT TENANCY)
================================ */
export const inventoryService = {
  async fetchLedger(outletId: string) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const { data, error } = await supabaseClient
      .from('inventory_ledger')
      .select('*')
      .eq('company_id', profile.company_id)     // 🔒 ADDED
      .eq('outlet_id', outletId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async recordStockIn(payload: any) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const { error } = await supabaseClient
      .from('inventory_ledger')
      .insert({
        ...payload,
        company_id: profile.company_id,          // 🔒 ADDED
        outlet_id: payload.outlet_id,
        transaction_type: 'STOCK_IN'
      });

    if (error) throw error;
  }
};

/* ===============================
   ROLES & TEAM (COMPANY SAFE)
================================ */
export const roleService = {
  async fetchTeam() {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('company_id', profile.company_id);   // 🔒 ADDED

    if (error) throw error;
    return data || [];
  }
};

/* ===============================
   PAYMENT MODES (OUTLET SAFE)
================================ */
export const paymentService = {
  async fetchActiveModes(outletId: string) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Unauthorized');

    const { data, error } = await supabaseClient
      .from('payment_modes')
      .select('*')
      .eq('company_id', profile.company_id)    // 🔒 ADDED
      .eq('outlet_id', outletId)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  }
};