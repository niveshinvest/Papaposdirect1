
import { getSupabase, authService } from './supabaseService';
import { GoogleGenAI, Type } from "@google/genai";
import { AIForecast } from '../types';
import { aiService } from './aiService';

export const forecastService = {
  /**
   * Generates a new forecast for a specific horizon with explainability and lineage.
   */
  async generateForecast(outletId: string | null, horizon: '7_DAYS' | '30_DAYS'): Promise<AIForecast> {
    if (await aiService.checkKillSwitch()) {
      throw new Error("AI services temporarily disabled by administrator.");
    }

    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    const startTime = Date.now();
    const minDays = horizon === '7_DAYS' ? 14 : 60;
    const historyStart = new Date();
    historyStart.setDate(historyStart.getDate() - 90); 

    let query = client
      .from('invoices')
      .select('grand_total, created_at')
      .eq('company_id', profile.company_id)
      .gte('created_at', historyStart.toISOString());

    if (outletId) query = query.eq('outlet_id', outletId);

    const { data: history } = await query.order('created_at', { ascending: true });
    const uniqueDays = new Set(history?.map(h => h.created_at.split('T')[0]));
    
    if (uniqueDays.size < minDays) {
      throw new Error(`Forecast unavailable: Insufficient ledger history. ${minDays} days required.`);
    }

    const dailySeries: Record<string, { rev: number; count: number }> = {};
    history?.forEach(inv => {
      const d = inv.created_at.split('T')[0];
      if (!dailySeries[d]) dailySeries[d] = { rev: 0, count: 0 };
      dailySeries[d].rev += Number(inv.grand_total);
      dailySeries[d].count += 1;
    });

    const baselineRevenue = Object.values(dailySeries).slice(-30).reduce((acc, d) => acc + d.rev, 0);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Demand Forecast: ${horizon}. Data: ${JSON.stringify(dailySeries)}`,
      config: {
        systemInstruction: `You are a restaurant data scientist in LEGAL-DEFENSE and EXPLAINABLE mode. 
          1. Every forecast MUST include an explanation_object.
          2. Cite specific historical baselines used. 
          3. State advisory nature explicitly.
          Return JSON matching AIForecast schema including explanation_object.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predicted_revenue_min: { type: Type.NUMBER },
            predicted_revenue_max: { type: Type.NUMBER },
            predicted_orders: { type: Type.NUMBER },
            peak_days: { type: Type.ARRAY, items: { type: Type.STRING } },
            slow_days: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence_score: { type: Type.NUMBER },
            assumptions: { type: Type.STRING },
            error_margin_percent: { type: Type.NUMBER },
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
          required: ['predicted_revenue_min', 'predicted_revenue_max', 'predicted_orders', 'confidence_score', 'error_margin_percent', 'explanation_object']
        }
      }
    });

    const prediction = JSON.parse(response.text || '{}');
    const forecast: Partial<AIForecast> = {
      company_id: profile.company_id,
      outlet_id: outletId || undefined,
      horizon: horizon,
      generated_at: new Date().toISOString(),
      historical_baseline_revenue: baselineRevenue,
      ...prediction,
      legal_disclaimer: "This insight is advisory in nature and does not constitute legal, tax, or accounting advice.",
      data_lineage: {
        tables: ['invoices'],
        date_range: { start: historyStart.toISOString(), end: new Date().toISOString() },
        limitations: ["Event-based external spikes (holidays) not manually flagged", "Only 90-day window used"]
      },
      compute_metadata: {
        computation_time_ms: Date.now() - startTime,
        data_volume_rows: history?.length || 0,
        execution_reason: "Manual Forecast Generation",
        cost_tier: horizon === '30_DAYS' ? 'HIGH' : 'MEDIUM'
      }
    };

    const { data: saved, error } = await client
      .from('ai_forecasts')
      .upsert(forecast, { onConflict: 'company_id, outlet_id, horizon' })
      .select()
      .single();

    if (error) throw new Error(error.message);

    await aiService.logGovernance({
      ai_mode: 'REGULATORY_SAFE',
      role_visibility: profile.role as any,
      data_sources: ['invoices'],
      confidence_score: prediction.confidence_score,
      payload_type: 'FORECAST'
    });

    return saved as AIForecast;
  },

  async fetchLatestForecasts(outletId?: string | null): Promise<AIForecast[]> {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return [];
    
    try {
      let query = client.from('ai_forecasts').select('*').eq('company_id', profile.company_id);
      if (outletId) query = query.eq('outlet_id', outletId); else query = query.is('outlet_id', null);
      const { data, error } = await query.order('horizon', { ascending: true });
      
      if (error) {
        console.warn("AI Forecasts query bypassed:", error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      return [];
    }
  }
};
