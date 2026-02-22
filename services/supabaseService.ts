
import { createClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../lib/supabaseClient';

// Use a let variable for the supabase client so it can be re-initialized if needed.
let supabaseClient = defaultClient;

export const getSupabase = () => supabaseClient;

/**
 * RE-INITIALIZATION SERVICE
 */
export const initSupabase = (url: string, key: string) => {
  supabaseClient = createClient(url, key);
};

export const testConnection = async (url: string, key: string) => {
  try {
    const client = createClient(url, key);
    const { error } = await client.from('profiles').select('id').limit(1);
    if (error) return { success: false, message: error.message || String(error) };
    return { success: true };
  } catch (e: any) {
    console.warn("Postgres Proxy check failed. Ensure your backend is running at:", url);
    return { success: false, message: e.message || String(e) };
  }
};

/**
 * CORE AUTH & TENANT SERVICES
 */
export const authService = {
  async getCurrentUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) return session.user;
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  },

  async getProfile() {
    try {
      const user = await this.getCurrentUser();
      if (!user) return null;

      let { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error("Cloud identity check failed:", error.message);
        throw new Error(error.message || "Failed to retrieve user profile from cloud.");
      }

      if (!data) {
        const { error: insertError } = await supabaseClient
          .from('profiles')
          .insert({
            id: user.id,
            full_name: user.user_metadata?.full_name || 'Staff Member',
            role: 'OWNER', 
            created_at: new Date().toISOString()
          });
        if (insertError) throw new Error(insertError.message);
        const { data: refreshed, error: refreshError } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        if (refreshError) throw new Error(refreshError.message);
        data = refreshed;
      }

      if (data && data.company_id) {
         const { data: company, error: compError } = await supabaseClient.from('companies').select('*').eq('id', data.company_id).maybeSingle();
         if (compError) throw new Error(compError.message);
         if (company) data.companies = company;
      }
      return data;
    } catch (e: any) {
      console.error("Auth Failure (Cloud Connection):", e.message || e);
      if (e.message === 'Failed to fetch') {
        console.warn("Network Error: Could not reach Supabase. Check your internet connection or Supabase URL.");
      }
      return null;
    }
  },

  async createCompany(name: string, passedUser?: any) {
    const user = passedUser || await this.getCurrentUser();
    if (!user) throw new Error("Authentication session missing.");

    const now = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(now.getDate() + 14);

    const { data: company, error: cError } = await supabaseClient
      .from('companies')
      .insert({ 
        name, 
        owner_id: user.id,
        subscription_status: 'trialing',
        subscription_plan: 'ENTERPRISE',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnd.toISOString()
      })
      .select().single();

    if (cError) throw new Error(cError.message || "Failed to create company registry.");

    const { error: pError } = await supabaseClient.from('profiles').upsert({ 
      id: user.id,
      full_name: user.user_metadata?.full_name || 'Owner',
      company_id: company.id, 
      role: 'OWNER',
      updated_at: new Date().toISOString()
    });

    if (pError) throw new Error(pError.message || "Failed to link profile to company.");

    return company;
  }
};

/**
 * MENU MODULE SERVICE (STRICT OUTLET ISOLATION)
 */
export const menuService = {
  async fetchCategories(outletId?: string) {
    let query = supabaseClient.from('menu_categories').select('*').order('sort_order', { ascending: true });
    if (outletId) query = query.eq('outlet_id', String(outletId));
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchItems(outletId?: string) {
    const query = supabaseClient
      .from('menu_items')
      .select('*, menu_categories(name)');
    
    if (outletId) {
      const { data, error } = await query.eq('outlet_id', String(outletId));
      if (error) throw new Error(error.message);
      return data || [];
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchTables(outletId: string) {
    const { data, error } = await supabaseClient
      .from('tables')
      .select('*')
      .eq('outlet_id', String(outletId))
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async saveCategory(category: { id?: string; name: string; outlet_id: string }) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");
    const { data, error } = await supabaseClient.from('menu_categories').upsert({ 
      ...category, 
      company_id: profile.company_id,
      outlet_id: String(category.outlet_id)
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async saveItem(item: { id?: string; name: string; category_id: string; base_price: number; outlet_id: string }) {
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");
    
    const cleanItem = {
      ...item,
      category_id: item.category_id === '' ? null : item.category_id,
      company_id: profile.company_id,
      outlet_id: String(item.outlet_id),
      created_by: profile.id
    };

    const { data, error } = await supabaseClient.from('menu_items').upsert(cleanItem).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
};

/**
 * DIRECT CLOUD ACCESS
 */
export const cloudOutlets = {
  async fetchAll() {
    const { data, error } = await supabaseClient.from('outlets').select('*');
    if (error) throw new Error(error.message);
    return data;
  },
  async upsert(outletData: any) {
    const { error: oError } = await supabaseClient.from('outlets').upsert({
      ...outletData,
      id: String(outletData.id)
    });
    if (oError) throw new Error(oError.message);
  },
  async delete(id: string) {
    const { error } = await supabaseClient.from('outlets').delete().eq('id', String(id));
    if (error) throw new Error(error.message);
  }
};

/**
 * INVENTORY SERVICE (STRICT OUTLET ISOLATION)
 */
export const inventoryService = {
  async fetchBatches(outletId: string) {
    const { data, error } = await supabaseClient.from('inventory_batches').select('*').eq('outlet_id', String(outletId));
    if (error) throw new Error(error.message);
    return data || [];
  },
  async fetchLedger(outletId: string) {
    const { data, error } = await supabaseClient.from('inventory_ledger').select('*, profiles(full_name)').eq('outlet_id', String(outletId)).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async recordStockIn(payload: any) {
    const profile = await authService.getProfile();
    if (!payload.outlet_id) throw new Error("Safety Block: Missing outlet_id for inventory movement.");
    
    const { error } = await supabaseClient.from('inventory_ledger').insert({
      company_id: profile?.company_id,
      outlet_id: String(payload.outlet_id),
      item_id: payload.item_id,
      qty_change: payload.qty,
      transaction_type: 'STOCK_IN',
      cost_price: payload.cost_price,
      batch_code: payload.batch_code,
      expiry_date: payload.expiry_date,
      balance_after: 0
    });
    if (error) throw new Error(error.message);
  },
  async recordWastage(payload: any) {
    const profile = await authService.getProfile();
    if (!payload.outlet_id) throw new Error("Safety Block: Missing outlet_id for loss event recording.");
    
    const { error } = await supabaseClient.from('inventory_ledger').insert({
      company_id: profile?.company_id,
      outlet_id: String(payload.outlet_id),
      item_id: payload.item_id,
      qty_change: -payload.qty,
      transaction_type: 'WASTAGE',
      reason: payload.reason,
      balance_after: 0
    });
    if (error) throw new Error(error.message);
  }
};

/**
 * ROLE & TEAM SERVICE
 */
export const roleService = {
  async fetchTeam() {
    const { data, error } = await supabaseClient.from('profiles').select('*, user_outlet_access(*)');
    if (error) throw new Error(error.message);
    return data || [];
  },
  async updateUserRole(userId: string, role: string) {
    const { error } = await supabaseClient.from('profiles').update({ role }).eq('id', userId);
    if (error) throw new Error(error.message);
  },
  async updateOutletAccess(userId: string, outletIds: string[]) {
    const { error: deleteError } = await supabaseClient.from('user_outlet_access').delete().eq('user_id', userId);
    if (deleteError) throw new Error(deleteError.message);
    if (outletIds.length > 0) {
      const { error: insertError } = await supabaseClient.from('user_outlet_access').insert(outletIds.map(oid => ({ user_id: userId, outlet_id: String(oid), company_id: 'pending' })));
      if (insertError) throw new Error(insertError.message);
    }
  }
};

/**
 * PAYMENT MODES SERVICE
 */
export const paymentService = {
  async fetchActiveModes(outletId: string): Promise<any[]> {
    const { data, error } = await supabaseClient
      .from('payment_modes')
      .select('*')
      .eq('outlet_id', outletId)
      .eq('is_active', true)
      .order('priority_order', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchDefaultMode(outletId: string): Promise<any | null> {
    const { data, error } = await supabaseClient
      .from('payment_modes')
      .select('*')
      .eq('outlet_id', outletId)
      .eq('is_default', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
};
