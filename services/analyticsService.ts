
import { getSupabase, authService } from './supabaseService';

export interface ReportParams {
  outletId?: string | null;
  startDate: string;
  endDate: string;
}

export const analyticsService = {
  /**
   * Fetches real aggregated sales data for the dashboard.
   * Standardized to use taxable_value and total_amount.
   */
  async getLiveStats(params: ReportParams) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    let query = client
      .from('invoices')
      .select('total_amount, taxable_value, total_tax, payment_method, created_at')
      .eq('company_id', profile.company_id)
      .gte('created_at', params.startDate)
      .lte('created_at', params.endDate);

    if (params.outletId) {
      query = query.eq('outlet_id', params.outletId);
    }

    const { data, error } = await query;
    if (error) {
       if (error.message.includes('column "taxable_value" does not exist')) {
         throw new Error("Migration Required: Please apply database migration 057 via Settings > Migration.");
       }
       throw new Error(error.message);
    }

    const stats = {
      gross_sales: 0,
      taxable_value: 0,
      total_tax: 0,
      order_count: data?.length || 0,
      avg_bill: 0,
      payment_splits: {} as Record<string, number>,
      hourly_sales: Array(24).fill(0)
    };

    data?.forEach(inv => {
      stats.gross_sales += Number(inv.total_amount);
      stats.taxable_value += Number(inv.taxable_value);
      stats.total_tax += Number(inv.total_tax);
      
      const method = inv.payment_method || 'Other';
      stats.payment_splits[method] = (stats.payment_splits[method] || 0) + Number(inv.total_amount);

      const hour = new Date(inv.created_at).getHours();
      stats.hourly_sales[hour] += Number(inv.total_amount);
    });

    stats.avg_bill = stats.order_count > 0 ? stats.gross_sales / stats.order_count : 0;

    return stats;
  },

  /**
   * Fetches top performing items based on real invoice data.
   */
  async getTopItems(params: ReportParams, limit = 5) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    const { data, error } = await client.rpc('get_top_selling_items', {
      p_company_id: profile.company_id,
      p_outlet_id: params.outletId || null,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
      p_limit: limit
    });

    if (error) {
      console.warn("Top items RPC failed:", error.message);
      return [];
    }
    return data || [];
  },

  /**
   * Fetches HSN Summary for GST compliance.
   */
  async getHsnSummary(params: ReportParams) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    const { data, error } = await client.rpc('get_hsn_summary', {
      p_company_id: profile.company_id,
      p_outlet_id: params.outletId || null,
      p_start_date: params.startDate,
      p_end_date: params.endDate
    });

    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Fetch full sales report for export.
   * Standardized to use taxable_value and total_amount.
   */
  async getFullSalesReport(params: ReportParams) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    let query = client
      .from('invoices')
      .select('invoice_number, created_at, outlet_id, total_amount, total_tax, taxable_value, payment_method, finalized_by_user_id')
      .eq('company_id', profile.company_id)
      .gte('created_at', params.startDate)
      .lte('created_at', params.endDate)
      .order('created_at', { ascending: false });

    if (params.outletId) {
      query = query.eq('outlet_id', params.outletId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Fetches the terminal fleet for the dashboard.
   */
  async getTerminalFleet() {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return [];

    const { data, error } = await client
      .from('terminals')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('last_seen_at', { ascending: false });

    if (error) {
      console.warn("Terminal fleet fetch failed:", error.message);
      return [];
    }
    return data || [];
  }
};
