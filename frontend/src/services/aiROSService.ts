import { getSupabase, authService } from "./supabaseService";
import { universalAIService } from "./UniversalAIService";
import { AIRequest } from "../types";

export const aiROSService = {
  /**
   * AI-ROS: Autonomous Purchase Creation
   * Analyzes inventory levels and demand forecast to generate POs.
   */
  async generateAutonomousPurchaseOrders(outletId: string) {
    const supabase = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    // 1. Fetch Inventory Levels
    const { data: inventory } = await supabase
      .from('inventory')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId);

    // 2. Fetch Demand Forecast
    const { data: forecast } = await supabase
      .from('ai_forecasts')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .eq('horizon', '7_DAYS')
      .maybeSingle();

    const prompt = `Based on current inventory levels: ${JSON.stringify(inventory)} 
    and demand forecast: ${JSON.stringify(forecast)}, 
    generate a list of items that need to be reordered. 
    Suggest quantities and prioritize based on stock-out risk.`;

    const request: AIRequest = {
      task_type: "AUTONOMOUS_PURCHASE_ORDER",
      prompt,
      response_mime_type: "application/json",
      response_schema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            inventory_id: { type: "STRING" },
            suggested_qty: { type: "NUMBER" },
            priority: { type: "STRING" },
            reason: { type: "STRING" }
          },
          required: ["inventory_id", "suggested_qty", "priority"]
        }
      }
    };

    const response = await universalAIService.generateContent(request);
    if (response.error) throw new Error(response.error);

    const actions = JSON.parse(response.text || '[]');
    
    // 3. Log as Operational Actions
    for (const action of actions) {
      await supabase.from('ai_operational_actions').insert({
        company_id: profile.company_id,
        outlet_id: outletId,
        action_type: 'AUTO_PO',
        action_payload: action,
        ai_confidence: 0.85,
        executed: false
      });
    }

    return actions;
  },

  /**
   * AI Food Cost Guardian: Detect Margin Collapse
   */
  async detectFoodCostAnomalies(outletId: string) {
    const supabase = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    // 1. Fetch Recipes and Recent Purchase Prices
    const { data: recipes } = await supabase
      .from('recipes')
      .select('*, menu_items(name)')
      .eq('company_id', profile.company_id);

    const prompt = `Analyze these recipes and recent ingredient price fluctuations: ${JSON.stringify(recipes)}.
    Detect any menu items where the food cost percentage has spiked or the margin has collapsed below 20%.`;

    const request: AIRequest = {
      task_type: "FOOD_COST_GUARDIAN",
      prompt,
      response_mime_type: "application/json",
      response_schema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            menu_item_id: { type: "STRING" },
            alert_type: { type: "STRING" },
            alert_message: { type: "STRING" },
            severity: { type: "STRING" }
          },
          required: ["menu_item_id", "alert_type", "alert_message", "severity"]
        }
      }
    };

    const response = await universalAIService.generateContent(request);
    if (response.error) throw new Error(response.error);

    const alerts = JSON.parse(response.text || '[]');
    
    // 2. Log Alerts
    for (const alert of alerts) {
      await supabase.from('food_cost_alerts').insert({
        company_id: profile.company_id,
        outlet_id: outletId,
        ...alert
      });
    }

    return alerts;
  },

  /**
   * Digital Twin: Daily Simulation
   */
  async runDigitalTwinSimulation(outletId: string, date: string) {
    const supabase = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    const prompt = `Simulate the restaurant operations for ${date} at outlet ${outletId}.
    Predict sales, order volume, inventory consumption, peak hours, and staffing needs based on historical patterns.`;

    const request: AIRequest = {
      task_type: "DIGITAL_TWIN_SIMULATION",
      prompt,
      response_mime_type: "application/json",
      response_schema: {
        type: "OBJECT",
        properties: {
          predicted_sales: { type: "NUMBER" },
          predicted_orders: { type: "INTEGER" },
          predicted_inventory_usage: { type: "OBJECT" },
          predicted_peak_hours: { type: "ARRAY", items: { type: "STRING" } },
          staffing_recommendation: { type: "OBJECT" }
        },
        required: ["predicted_sales", "predicted_orders"]
      }
    };

    const response = await universalAIService.generateContent(request);
    if (response.error) throw new Error(response.error);

    const simulation = JSON.parse(response.text || '{}');
    
    // 3. Save Simulation
    await supabase.from('restaurant_simulations').insert({
      company_id: profile.company_id,
      outlet_id: outletId,
      simulation_date: date,
      ...simulation
    });

    return simulation;
  }
};
