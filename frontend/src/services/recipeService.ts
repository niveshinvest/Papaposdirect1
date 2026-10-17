import { z } from "zod";
import { getSupabase, authService } from "./supabaseService";
import { universalAIService } from "./UniversalAIService";

export type RecipeStatus = 'DRAFT' | 'QUEUED' | 'FINALIZED' | 'REJECTED';
export type RecipeSource = 'AI' | 'MANUAL';

// 👇 PUT IT HERE (top-level helper)
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      console.warn(`Retry attempt ${i + 1} failed`);
      if (i === retries) throw e;
    }
  }
  throw new Error("Unreachable");
}

const RecipeSchema = z.object({
  ingredients: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      unit: z.string(),
      cost: z.number().optional()
    })
  ),
  steps: z.array(z.string()),
  total_cost: z.number()
});

export interface RecipeEntry {
  id: string;
  company_id: string;
  outlet_id: string;
  item_name: string;
  menu_item_id?: string;
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
  async generateRecipe(itemName: string, outletId: string, menu_item_id?: string): Promise<RecipeEntry> {
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
      const response = await withRetry(() =>
      universalAIService.generateContent({
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
      })
    );
      //console.log("RECIPE_SERVICE: AI_RESPONSE_RECEIVED", response);
      //if (response.error) throw new Error(response.error);

     // const recipeJson = JSON.parse(response.text || '{}');
      //console.log("RECIPE_SERVICE: AFTER_AI_RESPONSE", recipeJson);

if (response.error) throw new Error(response.error);


// 1. Extract JSON safely
let recipeJson;
try {
  recipeJson =
    universalAIService.extractStructuredJSON(response.text);
} catch (e) {
  console.error("JSON extraction failed:", response.text);
  throw new Error("AI returned invalid JSON");
}

// 2. Validate
let validated;
try {
  validated = RecipeSchema.parse(recipeJson);
} catch (err) {
  console.error("Invalid recipe format from AI:", recipeJson);
  throw new Error("AI returned invalid recipe format");
}

// 3. (Optional but recommended) override cost
// validated.total_cost = calculateRealCost(validated.ingredients);

// 4. Insert CLEAN data
const insertPayload = {
  company_id: profile.company_id,
  outlet_id: outletId,
  item_name: itemName,
  menu_item_id: menu_item_id || null,
  recipe_json: validated, // ✅ FIXED
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
    menu_item_id: string;
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
    
    if (payload.menu_item_id) {
      const { data: menuItem } = await client
        .from('menu_items')
        .select('name')
        .eq('company_id', profile.company_id)
        .eq('outlet_id', payload.outletId)
        .eq('id', payload.menu_item_id)
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
total_cost: resolvedIngredients.reduce(
  (sum, ing) =>
    sum + (Number(ing.cost || 0) * Number(ing.quantity || 0)),
  0
),      yield: payload.yield,
      notes: payload.notes
    };

    const insertPayload = {
      company_id: profile.company_id,
      outlet_id: payload.outletId,
      menu_item_id: payload.menu_item_id || null,
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
      .select('status, item_name, menu_item_id')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .eq('id', recipeId)
      .single();

    if (fetchError) throw new Error( fetchError.message);
    if (current.status !== 'DRAFT') throw new Error(`Cannot queue recipe in ${current.status} state. Must be DRAFT.`);
    
    console.log("checkstatuscomplete");
    const { data, error } = await client
      .from('recipes')
      .upsert({ 
        id: recipeId,
        company_id: profile.company_id,
        outlet_id: outletId,
        item_name: current.item_name,
        menu_item_id: current.menu_item_id,
        status: 'QUEUED',
        updated_at: new Date().toISOString()
      })
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

    const { data: current } = await client
      .from('recipes')
      .select('item_name, menu_item_id')
      .eq('id', recipeId)
      .single();

    const { data, error } = await client
      .from('recipes')
      .upsert({ 
        id: recipeId,
        company_id: profile.company_id,
        outlet_id: outletId,
        item_name: current?.item_name,
        menu_item_id: current?.menu_item_id,
        status: 'FINALIZED',
        updated_at: new Date().toISOString()
      })
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
  if (!profile?.company_id) {
    throw new Error("Company ID missing from profile");
  }

  const { data, error } = await client
    .from("recipes")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("outlet_id", outletId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const grouped: Record<RecipeStatus, RecipeEntry[]> = {
    DRAFT: [],
    QUEUED: [],
    FINALIZED: [],
    REJECTED: []
  };

  (data || []).forEach((raw: any) => {
    try {
      const recipeJson = raw.recipe_json || {};

      const normalized: RecipeEntry = {
        ...raw,

        recipe_json: {
          ingredients: Array.isArray(recipeJson.ingredients)
            ? recipeJson.ingredients.map((ing: any) => ({
                name: ing?.name || "Unknown",
                quantity: Number(ing?.quantity ?? 0),
                unit: ing?.unit || "unit",
                cost: Number(ing?.cost ?? 0),
                inventory_id: ing?.inventory_id || null
              }))
            : [],

          steps: Array.isArray(recipeJson.steps)
            ? recipeJson.steps
            : [],

          total_cost: Number(recipeJson.total_cost ?? 0),

          yield: Number(recipeJson.yield ?? 1),

          notes: recipeJson.notes || ""
        }
      };

      if (grouped[normalized.status]) {
        grouped[normalized.status].push(normalized);
      }
    } catch (err) {
      console.error("BROKEN_RECIPE_ROW", raw, err);
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

    const { data: current } = await client
      .from('recipes')
      .select('item_name, menu_item_id')
      .eq('id', recipeId)
      .single();

    const { error } = await client
      .from('recipes')
      .upsert({ 
        id: recipeId,
        company_id: profile.company_id,
        outlet_id: outletId,
        item_name: current?.item_name,
        menu_item_id: current?.menu_item_id,
        status: 'REJECTED',
        updated_at: new Date().toISOString()
      });

    if (error) throw new Error(error.message);
  }
};
