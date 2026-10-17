
import { getSupabase, authService } from './supabaseService';
import { universalAIService } from './UniversalAIService';
import { AIInsight, AIRecommendation, UserRole } from '../types';
import { notificationService } from './notificationService';

type SuspiciousReviewSummary = {
  recent_events: Array<{
    actor_user_id: string;
    action: string;
    timestamp: string;
    risk_score: number;
    reason: string;
  }>;
  top_actors: Array<{
    actor_user_id: string;
    events: number;
    deletes_or_voids: number;
    edits_or_updates: number;
    discounts: number;
    risk_score: number;
  }>;
};

export const aiService = {
  /**
   * Universal Kill-Switch Guard
   */
  async checkKillSwitch(): Promise<boolean> {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile?.company_id) return false;
    
    try {
      const { data: company } = await client
        .from('companies')
        .select('ai_kill_switch')
        .eq('id', profile.company_id)
        .single();
      return !!company?.ai_kill_switch;
    } catch (e) {
      return false;
    }
  },

  /**
   * Cost Control Guard: Prevents redundant AI execution
   */
  async checkCostGuard(type: string): Promise<boolean> {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return true;

    try {
      const { data: registry } = await client
        .from('ai_execution_registry')
        .select('last_executed_at')
        .eq('company_id', profile.company_id)
        .eq('execution_type', type)
        .maybeSingle();

      if (!registry) return false;

      // Enforce 1-hour delay between automated re-runs per category
      const minIntervalMs = 3600000;
      const timeSinceLast = Date.now() - new Date(registry.last_executed_at).getTime();
      return timeSinceLast < minIntervalMs;
    } catch (e) {
      console.warn(`Cost guard check bypassed for ${type} due to schema cache latency.`);
      return false;
    }
  },

  async updateExecutionTime(type: string) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return;
    try {
      await client.from('ai_execution_registry').upsert({
        company_id: profile.company_id,
        execution_type: type,
        last_executed_at: new Date().toISOString()
      }, { onConflict: 'company_id, execution_type' });
    } catch (e) {
      console.warn("Execution time update failed: schema likely pending.");
    }
  },

  async logGovernance(payload: {
    ai_mode: 'NORMAL' | 'REGULATORY_SAFE' | 'KILL_SWITCH_ACTIVE',
    role_visibility: 'OWNER' | 'INVESTOR',
    data_sources: string[],
    confidence_score: number,
    payload_type: 'INSIGHT' | 'RECOMMENDATION' | 'FORECAST',
    metadata?: any
  }) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return;

    try {
      await client.from('ai_governance_logs').insert({
        company_id: profile.company_id,
        actor_id: profile.id,
        ...payload
      });
    } catch (e) {
      console.warn("Governance log deferred: schema likely pending.");
    }
  },

  /**
   * Generates strategic recommendations with legal and explainability wrappers.
   */
  async generateStrategicRecommendations(outletId: string): Promise<AIRecommendation[]> {
    if (await this.checkKillSwitch()) {
      throw new Error("AI services temporarily disabled by administrator.");
    }

    if (await this.checkCostGuard('RECOMMENDATION')) {
      // Return cached results if available, otherwise halt
      const existing = await this.fetchRecommendations(outletId);
      if (existing.length > 0) return existing;
    }

    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    const startTime = Date.now();
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const [
      { data: salesHistory },
      { data: menuSnapshot },
      { data: recipes }
    ] = await Promise.all([
      client.from('invoice_items').select('*, invoices!inner(outlet_id, created_at)').eq('invoices.outlet_id', outletId).gte('invoices.created_at', last30Days.toISOString()),
      client.from('menu_items').select('*, menu_categories(name)').eq('outlet_id', outletId),
      client.from('recipes').select('menu_item_id, totalCost').eq('company_id', profile.company_id).eq('outlet_id', outletId)
    ]);

    const rowCount = (salesHistory?.length || 0) + (menuSnapshot?.length || 0);

    const itemPerformance = (menuSnapshot || []).map(item => {
      const sales = (salesHistory || []).filter(s => s.menu_item_id === item.id);
      const totalQty = sales.reduce((acc, s) => acc + Number(s.quantity), 0);
      const recipe = (recipes || []).find(r => r.menu_item_id === item.id);
      const margin = recipe ? (Number(item.base_price) - Number(recipe.totalCost)) : null;
      return { id: item.id, name: item.name, price: item.base_price, qty_30d: totalQty, margin };
    });

    const response = await universalAIService.generateContent({
      prompt: `Strategic analysis for outlet: ${outletId}. Data: ${JSON.stringify(itemPerformance.filter(i => i.qty_30d > 0))}`,
      system_prompt: `You are PapaPOS Restaurant POS Analytics AI acting as a restaurant business consultant in LEGAL-DEFENSE and EXPLAINABLE mode.
          1. Prioritize actionable restaurant intelligence, not generic commentary.
          2. Mandatory explainability object for every recommendation.
          3. Mandatory disclaimer header.
          4. Cite exact data points evaluated.
          5. State thresholds crossed (e.g., Margin < 30%).
          6. Keep recommendations concise and directly usable by outlet operators.
          Return JSON array of AIRecommendation including explanation_object.`,
      response_mime_type: "application/json",
      response_schema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING" },
            title: { type: "STRING" },
            description: { type: "STRING" },
            rationale: { type: "STRING" },
            expected_impact: { type: "STRING" },
            confidence_score: { type: "NUMBER" },
            risk_assessment: { type: "STRING" },
            explanation_object: {
              type: "OBJECT",
              properties: {
                trigger_condition: { type: "STRING" },
                data_points_evaluated: { type: "NUMBER" },
                rules_applied: { type: "ARRAY", items: { type: "STRING" } },
                thresholds_crossed: { type: "ARRAY", items: { type: "STRING" } },
                comparisons_used: { type: "STRING" },
                confidence_score: { type: "NUMBER" }
              },
              required: ['trigger_condition', 'rules_applied']
            }
          },
          required: ['type', 'title', 'description', 'rationale', 'expected_impact', 'confidence_score', 'explanation_object']
        }
      }
    });

    if (response.error) throw new Error(response.error);

    const finalRecs = JSON.parse(response.text || '[]').map((raw: any) => ({
      ...raw,
      company_id: profile.company_id,
      outlet_id: outletId,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      legal_disclaimer: "This insight is advisory in nature and does not constitute legal, tax, or accounting advice.",
      data_lineage: {
        tables: ['invoice_items', 'menu_items', 'recipes'],
        date_range: { start: last30Days.toISOString(), end: new Date().toISOString() },
        limitations: ["External market competition not considered", "Staff manual errors not filtered"]
      },
      compute_metadata: {
        computation_time_ms: Date.now() - startTime,
        data_volume_rows: rowCount,
        execution_reason: "Manual Strategy Generation",
        cost_tier: rowCount > 1000 ? 'MEDIUM' : 'LOW'
      }
    }));

    await client.from('ai_recommendations').insert(finalRecs);
    await this.updateExecutionTime('RECOMMENDATION');
    
    await this.logGovernance({
      ai_mode: 'REGULATORY_SAFE',
      role_visibility: profile.role as any,
      data_sources: ['invoice_items', 'menu_items', 'recipes'],
      confidence_score: finalRecs[0]?.confidence_score || 0.5,
      payload_type: 'RECOMMENDATION',
      metadata: { row_count: rowCount }
    });
    
    return finalRecs;
  },

  /**
   * Generates live business insights and real-time alerts.
   */
  async generateFreshInsights(outletId: string): Promise<AIInsight[]> {
    if (await this.checkKillSwitch()) {
      throw new Error("AI services temporarily disabled by administrator.");
    }

    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    const startTime = Date.now();
    const today = new Date();
    today.setHours(0,0,0,0);
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);

    const [
      { data: todayInvoices },
      { data: lastWeekInvoices },
      { data: terminals },
      auditResult
    ] = await Promise.all([
      client.from('invoices').select('*').eq('outlet_id', outletId).gte('created_at', today.toISOString()),
      client.from('invoices').select('*').eq('outlet_id', outletId).gte('created_at', lastWeek.toISOString()).lt('created_at', today.toISOString()),
      client.from('terminals').select('*').eq('outlet_id', outletId),
      client.from('audit_logs').select('action, actor_user_id, metadata, timestamp').eq('company_id', profile.company_id).gte('timestamp', lastWeek.toISOString())
    ]);

    const breaches: any[] = [];
    const todaySales = todayInvoices?.reduce((acc, i) => acc + Number(i.grand_total), 0) || 0;
    const avgDailySales = (lastWeekInvoices?.reduce((acc, i) => acc + Number(i.grand_total), 0) || 0) / 7;

    if (todaySales < (avgDailySales * 0.5) && (new Date().getHours() > 14)) {
       breaches.push({ category: 'SALES', severity: 'HIGH', title: 'Revenue Drop Detected', fact: `₹${todaySales} vs baseline ₹${avgDailySales.toFixed(0)}.` });
    }

    const offlineTerminals = terminals?.filter(t => (Date.now() - new Date(t.last_seen_at).getTime()) > 600000);
    if (offlineTerminals && offlineTerminals.length > 0) {
      breaches.push({ category: 'FLEET', severity: 'CRITICAL', title: 'Sync Interruption', fact: `${offlineTerminals.length} terminals disconnected.` });
    }

    const auditLogs = auditResult?.data || [];
    const suspiciousAuditLogs = auditLogs.filter((log: any) => {
      const action = String(log.action || '').toUpperCase();
      return action.includes('INVOICE') || action.includes('BILL') || action.includes('DELETE') || action.includes('VOID') || action.includes('DISCOUNT');
    });

    const destructiveAuditLogs = suspiciousAuditLogs.filter((log: any) => {
      const action = String(log.action || '').toUpperCase();
      return action.includes('DELETE') || action.includes('VOID');
    });

    const editAuditLogs = suspiciousAuditLogs.filter((log: any) => {
      const action = String(log.action || '').toUpperCase();
      return action.includes('EDIT') || action.includes('UPDATE') || action.includes('MODIFY');
    });

    if (editAuditLogs.length >= 3) {
      breaches.push({
        category: 'SECURITY',
        severity: 'HIGH',
        title: 'Repeated Bill Edits Detected',
        fact: `${editAuditLogs.length} invoice edit events were logged in the last 7 days.`,
      });
    }

    if (destructiveAuditLogs.length > 0) {
      breaches.push({
        category: 'SECURITY',
        severity: 'CRITICAL',
        title: 'Bill Deletion or Void Activity Detected',
        fact: `${destructiveAuditLogs.length} delete/void bill events were logged recently.`,
      });
    }

    const actorCounts = suspiciousAuditLogs.reduce((acc: Record<string, number>, log: any) => {
      const actorId = String(log.actor_user_id || 'unknown');
      acc[actorId] = (acc[actorId] || 0) + 1;
      return acc;
    }, {});

    const topSuspiciousActor = (Object.entries(actorCounts) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];
    if (topSuspiciousActor && topSuspiciousActor[1] >= 4) {
      breaches.push({
        category: 'SECURITY',
        severity: 'HIGH',
        title: 'Cashier Risk Pattern Detected',
        fact: `One staff account triggered ${topSuspiciousActor[1]} suspicious bill-related events in the last 7 days.`,
      });
    }

    if (breaches.length === 0) return [];

    const response = await universalAIService.generateContent({
      prompt: `Interpret operational breaches: ${JSON.stringify(breaches)}`,
      system_prompt: `You are PapaPOS Restaurant POS Analytics AI acting as a restaurant business consultant and fraud-watch analyst in LEGAL-DEFENSE and EXPLAINABLE mode. 
          1. Every insight MUST include an explanation_object.
          2. Never claim absolute correctness.
          3. Mandatory disclaimer.
          4. Focus on operational causes, business impact, and the next best action.
          5. Treat bill edits, deletes, voids, and suspicious cashier patterns as potential risk signals that need owner review.
          5. Keep outputs concise and useful for restaurant operators.
          Return JSON array of AIInsight including explanation_object.`,
      response_mime_type: "application/json",
      response_schema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING" },
            severity: { type: "STRING" },
            title: { type: "STRING" },
            summary: { type: "STRING" },
            explanation: { type: "STRING" },
            recommended_action: { type: "STRING" },
            confidence_score: { type: "NUMBER" },
            explanation_object: {
              type: "OBJECT",
              properties: {
                trigger_condition: { type: "STRING" },
                data_points_evaluated: { type: "NUMBER" },
                rules_applied: { type: "ARRAY", items: { type: "STRING" } },
                thresholds_crossed: { type: "ARRAY", items: { type: "STRING" } },
                comparisons_used: { type: "STRING" },
                confidence_score: { type: "NUMBER" }
              },
              required: ['trigger_condition', 'rules_applied']
            }
          },
          required: ['title', 'summary', 'explanation', 'recommended_action', 'confidence_score', 'explanation_object']
        }
      }
    });

    if (response.error) throw new Error(response.error);

    const finalInsights: AIInsight[] = JSON.parse(response.text || '[]').map((raw: any, idx: number) => ({
       id: `AI-${Date.now()}-${idx}`,
       company_id: profile.company_id,
       outlet_id: outletId,
       ...raw,
       generated_at: new Date().toISOString(),
       is_read: false,
       is_dismissed: false,
       source_tables: ['invoices', 'terminals', 'audit_logs'],
       legal_disclaimer: "This insight is advisory in nature and does not constitute legal, tax, or accounting advice.",
       data_lineage: {
         tables: ['invoices', 'terminals', 'audit_logs'],
         date_range: { start: lastWeek.toISOString(), end: new Date().toISOString() },
         limitations: ["Only internal POS data used", "No external network latency factors accounted", "Audit insight quality depends on how consistently bill edits/deletes are logged"]
       },
       compute_metadata: {
         computation_time_ms: Date.now() - startTime,
         data_volume_rows: (todayInvoices?.length || 0) + (lastWeekInvoices?.length || 0),
         execution_reason: "Automated Breach Audit",
         cost_tier: 'LOW'
       }
    }));

    await client.from('ai_insights').insert(finalInsights);
    
    await this.logGovernance({
      ai_mode: 'REGULATORY_SAFE',
      role_visibility: profile.role as any,
      data_sources: ['invoices', 'terminals'],
      confidence_score: finalInsights[0]?.confidence_score || 0.8,
      payload_type: 'INSIGHT'
    });

    finalInsights.forEach(insight => notificationService.dispatchAlert(insight));
    return finalInsights;
  },

  async fetchInsights(outletId?: string | null) {
    const client = getSupabase();
    if (!client) return [];
    
    try {
      let query = client.from('ai_insights').select('*').eq('is_dismissed', false).order('generated_at', { ascending: false });
      if (outletId) query = query.eq('outlet_id', outletId);
      const { data, error } = await query;
      if (error) {
        console.warn("AI Insights query bypassed:", error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      return [];
    }
  },

  async dismissInsight(id: string) {
    const client = getSupabase();
    try {
      const { error } = await client
        .from('ai_insights')
        .upsert({ id, is_dismissed: true, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("Dismiss failed:", e);
    }
  },

  async toggleKillSwitch(companyId: string, status: boolean) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (profile?.role !== 'OWNER') throw new Error("Owner-only action.");

    const { error } = await client.from('companies').upsert({ 
      id: companyId, 
      ai_kill_switch: status,
      updated_at: new Date().toISOString()
    });
    if (error) throw new Error(error.message);

    await client.from('audit_logs').insert({
      company_id: companyId,
      actor_user_id: profile.id,
      action: status ? 'AI_KILL_SWITCH_ACTIVATED' : 'AI_KILL_SWITCH_DEACTIVATED',
      metadata: { timestamp: new Date().toISOString() }
    });
  },

  async updateRecommendationStatus(id: string, status: 'APPROVED' | 'DISMISSED' | 'APPLIED') {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!client || !profile) return;
    try {
      const updates: any = { id, status, updated_at: new Date().toISOString() };
      if (status === 'APPROVED' || status === 'APPLIED') {
         updates.approved_at = new Date().toISOString();
         updates.approved_by = profile.id;
      }
      const { error } = await client.from('ai_recommendations').upsert(updates);
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("Status update failed:", e);
    }
  },

  async fetchRecommendations(outletId?: string | null) {
    const client = getSupabase();
    if (!client) return [];
    
    try {
      let query = client
        .from('ai_recommendations')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (outletId) query = query.eq('outlet_id', outletId);

      const { data, error } = await query;
      if (error) {
        console.warn("AI Recommendations query bypassed:", error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      return [];
    }
  },

  async fetchSuspiciousActivityReview(days = 7): Promise<SuspiciousReviewSummary> {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!client || !profile) {
      return { recent_events: [], top_actors: [] };
    }

    const from = new Date();
    from.setDate(from.getDate() - days);

    try {
      const { data, error } = await client
        .from('audit_logs')
        .select('actor_user_id, action, timestamp, metadata')
        .eq('company_id', profile.company_id)
        .gte('timestamp', from.toISOString())
        .order('timestamp', { ascending: false })
        .limit(200);

      if (error) throw error;

      const suspicious = (data || []).filter((log: any) => {
        const action = String(log.action || '').toUpperCase();
        return ['DELETE', 'VOID', 'EDIT', 'UPDATE', 'MODIFY', 'DISCOUNT', 'REFUND'].some(token => action.includes(token));
      });

      const recent_events = suspicious.slice(0, 20).map((log: any) => {
        const action = String(log.action || '').toUpperCase();
        const deletesOrVoids = action.includes('DELETE') || action.includes('VOID');
        const edits = action.includes('EDIT') || action.includes('UPDATE') || action.includes('MODIFY');
        const discounts = action.includes('DISCOUNT') || action.includes('REFUND');
        const risk_score = (deletesOrVoids ? 5 : 0) + (edits ? 3 : 0) + (discounts ? 2 : 0);
        const reason = deletesOrVoids
          ? 'Delete or void activity needs immediate review.'
          : edits
            ? 'Bill value or contents were changed after creation.'
            : 'Discount or refund pattern should be checked against approval policy.';

        return {
          actor_user_id: String(log.actor_user_id || 'unknown'),
          action,
          timestamp: log.timestamp,
          risk_score,
          reason,
        };
      });

      const grouped = recent_events.reduce((acc: Record<string, SuspiciousReviewSummary['top_actors'][number]>, event) => {
        const current = acc[event.actor_user_id] || {
          actor_user_id: event.actor_user_id,
          events: 0,
          deletes_or_voids: 0,
          edits_or_updates: 0,
          discounts: 0,
          risk_score: 0,
        };

        current.events += 1;
        current.risk_score += event.risk_score;
        if (event.action.includes('DELETE') || event.action.includes('VOID')) current.deletes_or_voids += 1;
        if (event.action.includes('EDIT') || event.action.includes('UPDATE') || event.action.includes('MODIFY')) current.edits_or_updates += 1;
        if (event.action.includes('DISCOUNT') || event.action.includes('REFUND')) current.discounts += 1;
        acc[event.actor_user_id] = current;
        return acc;
      }, {});

      const top_actors = (Object.values(grouped) as SuspiciousReviewSummary['top_actors']).sort((a, b) => b.risk_score - a.risk_score).slice(0, 10);
      return { recent_events, top_actors };
    } catch (e) {
      console.warn('Suspicious activity review unavailable:', e);
      return { recent_events: [], top_actors: [] };
    }
  }
};
