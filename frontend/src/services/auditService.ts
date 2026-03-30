
import { getSupabase, authService } from './supabaseService';

export const auditService = {
  async logAction(payload: {
    action: string;
    target_user_id?: string;
    old_value?: any;
    new_value?: any;
    metadata?: any;
  }) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return;

    const { error } = await client.from('audit_logs').insert({
      company_id: profile.company_id,
      actor_user_id: profile.id,
      action: payload.action,
      target_user_id: payload.target_user_id,
      old_value: payload.old_value,
      new_value: payload.new_value,
      metadata: payload.metadata
    });

    if (error) console.error("Audit log failed:", error.message);
  },

  async fetchLogs() {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return [];

    const { data, error } = await client
      .from('audit_logs')
      .select('*, profiles!actor_user_id(full_name)')
      .eq('company_id', profile.company_id)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return data || [];
  }
};
