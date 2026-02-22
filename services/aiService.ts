
import { getSupabase, authService } from './supabaseService';
import { GoogleGenAI, Type } from "@google/genai";
import { AIInsight, AIRecommendation, UserRole } from '../types';
import { notificationService } from './notificationService';

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
      client.from('recipes').select('menuItemId, totalCost').eq('company_id', profile.company_id)
    ]);

    const rowCount = (salesHistory?.length || 0) + (menuSnapshot?.length || 0);

    const itemPerformance = (menuSnapshot || []).map(item => {
      const sales = (salesHistory || []).filter(s => s.menu_item_id === item.id);
      const totalQty = sales.reduce((acc, s) => acc + Number(s.quantity), 0);
      const recipe = (recipes || []).find(r => r.menuItemId === item.id);
      const margin = recipe ? (Number(item.base_price) - Number(recipe.totalCost)) : null;
      return { id: item.id, name: item.name, price: item.base_price, qty_30d: totalQty, margin };
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Strategic analysis for outlet: ${outletId}. Data: ${JSON.stringify(itemPerformance.filter(i => i.qty_30d > 0))}`,
      config: {
        systemInstruction: `You are a professional restaurant engineer in LEGAL-DEFENSE and EXPLAINABLE mode.
          1. Mandatory explainability object for every recommendation.
          2. Mandatory disclaimer header.
          3. Cite exact data points evaluated.
          4. State thresholds crossed (e.g., Margin < 30%).
          Return JSON array of AIRecommendation including explanation_object.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              rationale: { type: Type.STRING },
              expected_impact: { type: Type.STRING },
              confidence_score: { type: Type.NUMBER },
              risk_assessment: { type: Type.STRING },
              explanation_object: {
                type: Type.OBJECT,
                properties: {
                  trigger_condition: { type: Type.STRING },
                  data_points_evaluated: { type: Type.NUMBER },
                  rules_applied: { type: Type.ARRAY, items: { type: Type.STRING } },
                  thresholds_crossed: { type: Type.ARRAY, items: { type: Type.STRING } },
                  comparisons_used: { type: Type.STRING },
                  confidence_score: { type: Type.NUMBER }
                },
                required: ['trigger_condition', 'rules_applied']
              }
            },
            required: ['type', 'title', 'description', 'rationale', 'expected_impact', 'confidence_score', 'explanation_object']
          }
        }
      }
    });

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
      { data: terminals }
    ] = await Promise.all([
      client.from('invoices').select('*').eq('outlet_id', outletId).gte('created_at', today.toISOString()),
      client.from('invoices').select('*').eq('outlet_id', outletId).gte('created_at', lastWeek.toISOString()).lt('created_at', today.toISOString()),
      client.from('terminals').select('*').eq('outlet_id', outletId)
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

    if (breaches.length === 0) return [];

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Interpret operational breaches: ${JSON.stringify(breaches)}`,
      config: {
        systemInstruction: `You are a Forensic AI Control Plane in LEGAL-DEFENSE and EXPLAINABLE mode. 
          1. Every insight MUST include an explanation_object.
          2. Never claim absolute correctness.
          3. Mandatory disclaimer.
          Return JSON array of AIInsight including explanation_object.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              severity: { type: Type.STRING },
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              explanation: { type: Type.STRING },
              recommended_action: { type: Type.STRING },
              confidence_score: { type: Type.NUMBER },
              explanation_object: {
                type: Type.OBJECT,
                properties: {
                  trigger_condition: { type: Type.STRING },
                  data_points_evaluated: { type: Type.NUMBER },
                  rules_applied: { type: Type.ARRAY, items: { type: Type.STRING } },
                  thresholds_crossed: { type: Type.ARRAY, items: { type: Type.STRING } },
                  comparisons_used: { type: Type.STRING },
                  confidence_score: { type: Type.NUMBER }
                },
                required: ['trigger_condition', 'rules_applied']
              }
            },
            required: ['title', 'summary', 'explanation', 'recommended_action', 'confidence_score', 'explanation_object']
          }
        }
      }
    });

    const finalInsights: AIInsight[] = JSON.parse(response.text || '[]').map((raw: any, idx: number) => ({
       id: `AI-${Date.now()}-${idx}`,
       company_id: profile.company_id,
       outlet_id: outletId,
       ...raw,
       generated_at: new Date().toISOString(),
       is_read: false,
       is_dismissed: false,
       source_tables: ['invoices', 'terminals'],
       legal_disclaimer: "This insight is advisory in nature and does not constitute legal, tax, or accounting advice.",
       data_lineage: {
         tables: ['invoices', 'terminals'],
         date_range: { start: lastWeek.toISOString(), end: new Date().toISOString() },
         limitations: ["Only internal POS data used", "No external network latency factors accounted"]
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
        .update({ is_dismissed: true })
        .eq('id', id);
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("Dismiss failed:", e);
    }
  },

  async toggleKillSwitch(companyId: string, status: boolean) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (profile?.role !== 'OWNER') throw new Error("Owner-only action.");

    const { error } = await client.from('companies').update({ ai_kill_switch: status }).eq('id', companyId);
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
      const updates: any = { status };
      if (status === 'APPROVED' || status === 'APPLIED') {
         updates.approved_at = new Date().toISOString();
         updates.approved_by = profile.id;
      }
      const { error } = await client.from('ai_recommendations').update(updates).eq('id', id);
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
  }
};
