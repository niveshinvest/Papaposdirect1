
import { getSupabase, authService } from "./supabaseService";
import { universalAIService } from "./UniversalAIService";

export type RecipeStatus = 'DRAFT' | 'QUEUED' | 'FINALIZED' | 'REJECTED';
export type RecipeSource = 'AI' | 'MANUAL';

export interface RecipeEntry {
  id: string;
  company_id: string;
  outlet_id: string;
  item_name: string;
  recipe_json: {
    ingredients: Array<{
      name: string;
      quantity: number;
      unit: string;
      cost?: number;
    }>;
    steps: string[];
    total_cost: number;
    yield?: number;
    notes?: string;
  };
  ai_prompt?: string;
  source: RecipeSource;
  status: RecipeStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export const recipeService = {
  /**
   * 1. generateRecipe(itemName)
   * - Validate company_id & outlet_id
   * - Call AI provider
   * - Parse structured recipe
   * - INSERT recipe with status = 'DRAFT', source = 'AI'
   * - RETURN saved record
   */
  async generateRecipe(itemName: string, outletId: string): Promise<RecipeEntry> {
    console.log(`RECIPE_SERVICE: START_GENERATION for ${itemName}`);
    
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const prompt = `Generate a standard commercial recipe for: ${itemName}. 
    Focus on primary raw materials (ingredients) and steps. 
    Provide precise commercial quantities (e.g., in kg, grams, ml, or units).`;

    console.log("RECIPE_SERVICE: BEFORE_AI_CALL", { itemName, prompt });

    try {
      const response = await universalAIService.generateContent({
        prompt,
        system_prompt: "You are a professional chef. Provide ingredients for a single portion of this dish. Use standard commercial units (kg, gram, litre, ml, unit). Also provide cooking steps. Calculate a rough total cost assuming standard market rates.",
        response_mime_type: "application/json",
        response_schema: {
          type: "OBJECT",
          properties: {
            ingredients: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  quantity: { type: "NUMBER" },
                  unit: { type: "STRING" },
                  cost: { type: "NUMBER" }
                },
                required: ['name', 'quantity', 'unit']
              }
            },
            steps: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            total_cost: { type: "NUMBER" }
          },
          required: ['ingredients', 'steps', 'total_cost']
        }
      });

      if (response.error) throw new Error(response.error);

      const recipeJson = JSON.parse(response.text || '{}');
      console.log("RECIPE_SERVICE: AFTER_AI_RESPONSE", recipeJson);

      const insertPayload = {
        company_id: profile.company_id,
        outlet_id: outletId,
        item_name: itemName,
        recipe_json: recipeJson,
        ai_prompt: prompt,
        source: 'AI',
        status: 'DRAFT',
        created_by: (await client.auth.getUser()).data.user?.id
      };

      console.log("RECIPE_SERVICE: BEFORE_DB_INSERT", insertPayload);

      const { data, error } = await client
        .from('recipes')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error("RECIPE_SERVICE: DB_INSERT_ERROR", error);
        throw new Error(error.message);
      }

      console.log("RECIPE_SERVICE: AFTER_DB_INSERT", data);
      return data;
    } catch (error: any) {
      console.error("RECIPE_SERVICE: GENERATION_FAILED", error);
      throw error;
    }
  },

  /**
   * 1.5 createManualRecipe(payload)
   * - Validate company_id & outlet_id
   * - Validate ingredients, steps, quantities
   * - Build recipe_json from form input
   * - INSERT recipe with:
   *     source = 'MANUAL'
   *     status = 'DRAFT'
   * - RETURN saved record
   */
  async createManualRecipe(payload: {
    menuitemid: string;
    itemName:string;
    outletId: string;
    ingredients: Array<{ name: string; quantity: number; unit: string; cost: number; inventoryItemId?: string }>;
    steps: string[];
    yield: number;
    notes?: string;
  }): Promise<RecipeEntry> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    // FIX START
    let resolvedItemName = payload.itemName || 'Unnamed Recipe';
    
    if (payload.menuitemid) {
      const { data: menuItem } = await client
        .from('menu_items')
        .select('name')
        .eq('company_id', profile.company_id)
        .eq('outlet_id', payload.outletId)
        .eq('id', payload.menuitemid)
        .single();
      if (menuItem) resolvedItemName = menuItem.name;
    }

    // Resolve ingredients by name to inventory IDs if missing
    const resolvedIngredients = await Promise.all(payload.ingredients.map(async (ing) => {
      // FIX START: Prioritize inventory_id (UUID)
      const invId = ing.inventoryItemId || (ing as any).inventory_id;
      if (invId) {
        return { ...ing, inventory_id: invId };
      }
      
      const { data: invItem } = await client
        .from('inventory')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('outlet_id', payload.outletId)
        .ilike('name', ing.name)
        .maybeSingle();
        
      return {
        ...ing,
        inventory_id: invItem?.id || null
      };
      // FIX END
    }));

    const recipeJson = {
      ingredients: resolvedIngredients,
      steps: payload.steps,
      total_cost: resolvedIngredients.reduce((sum, ing) => sum + (ing.cost || 0), 0),
      yield: payload.yield,
      notes: payload.notes
    };

    const insertPayload = {
      company_id: profile.company_id,
      outlet_id: payload.outletId,
      menu_item_id:payload.menuitemid,
      item_name: resolvedItemName,
      recipe_json: recipeJson,
      source: 'MANUAL',
      status: 'DRAFT',
      created_by: (await client.auth.getUser()).data.user?.id
    };

    const { data, error } = await client
      .from('recipes')
      .insert(insertPayload)
      .select()
      .single();
    // FIX END

    if (error) {
      console.error("RECIPE_SERVICE: DB_INSERT_MANUAL_ERROR", error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * 2. queueRecipe(recipeId)
   * - Update status -> QUEUED
   * - Reject if recipe not in DRAFT
   */
  async queueRecipe(recipeId: string, outletId: string): Promise<RecipeEntry> {
    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");
    console.log("Myoutlet_id", outletId);
    const client = getSupabase();

    if (!client) throw new Error("Supabase client not initialized");

    // Check current status
    const { data: current, error: fetchError } = await client
      .from('recipes')
      .select('status')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .eq('id', recipeId)
      .single();

     console.log("heheheheeeheheeh", fetchError.message);
    if (fetchError) throw new Error( fetchError.message);
    if (current.status !== 'DRAFT') throw new Error(`Cannot queue recipe in ${current.status} state. Must be DRAFT.`);

    const { data, error } = await client
      .from('recipes')
      .update({ status: 'QUEUED' })
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .eq('id', recipeId)
      .select()
      .single();
       
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * 3. finalizeRecipe(recipeId)
   * - Update status -> FINALIZED
   * - Lock recipe from edits
   * - Make available to POS
   */
  async finalizeRecipe(recipeId: string, outletId: string): Promise<RecipeEntry> {
    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");


    const { data, error } = await client
      .from('recipes')
      .update({ status: 'FINALIZED' })
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .eq('id', recipeId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * 4. fetchRecipes(outletId)
   * - MUST return recipes grouped by status
   * - MUST filter by company_id + outlet_id
   */
  async fetchRecipes(outletId: string): Promise<Record<RecipeStatus, RecipeEntry[]>> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const { data, error } = await client
      .from('recipes')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const grouped: Record<RecipeStatus, RecipeEntry[]> = {
      DRAFT: [],
      QUEUED: [],
      FINALIZED: [],
      REJECTED: []
    };

    (data || []).forEach((recipe: RecipeEntry) => {
      if (grouped[recipe.status]) {
        grouped[recipe.status].push(recipe);
      }
    });

    return grouped;
  },

  async getFinalizedRecipeByItemName(itemName: string, outletId: string): Promise<RecipeEntry | null> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const { data, error } = await client
      .from('recipes')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .eq('item_name', itemName)
      .eq('status', 'FINALIZED')
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  async rejectRecipe(recipeId: string, outletId: string): Promise<void> {
    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const { error } = await client
      .from('recipes')
      .update({ status: 'REJECTED' })
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .eq('id', recipeId);

    if (error) throw new Error(error.message);
  }
};
