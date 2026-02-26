
import { GoogleGenAI, Type } from "@google/genai";
import { getSupabase, authService } from "./supabaseService";

export type RecipeStatus = 'DRAFT' | 'QUEUED' | 'FINALIZED' | 'REJECTED';

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
  };
  ai_prompt?: string;
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
   * - INSERT recipe with status = 'DRAFT'
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: "You are a professional chef. Provide ingredients for a single portion of this dish. Use standard commercial units (kg, gram, litre, ml, unit). Also provide cooking steps. Calculate a rough total cost assuming standard market rates.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ingredients: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    cost: { type: Type.NUMBER }
                  },
                  required: ['name', 'quantity', 'unit']
                }
              },
              steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              total_cost: { type: Type.NUMBER }
            },
            required: ['ingredients', 'steps', 'total_cost']
          }
        }
      });

      const recipeJson = JSON.parse(response.text || '{}');
      console.log("RECIPE_SERVICE: AFTER_AI_RESPONSE", recipeJson);

      const insertPayload = {
        company_id: profile.company_id,
        outlet_id: outletId,
        item_name: itemName,
        recipe_json: recipeJson,
        ai_prompt: prompt,
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
   * 2. queueRecipe(recipeId)
   * - Update status -> QUEUED
   * - Reject if recipe not in DRAFT
   */
  async queueRecipe(recipeId: string): Promise<RecipeEntry> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    // Check current status
    const { data: current, error: fetchError } = await client
      .from('recipes')
      .select('status')
      .eq('id', recipeId)
      .single();

    if (fetchError) throw new Error(fetchError.message);
    if (current.status !== 'DRAFT') throw new Error(`Cannot queue recipe in ${current.status} state. Must be DRAFT.`);

    const { data, error } = await client
      .from('recipes')
      .update({ status: 'QUEUED' })
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
  async finalizeRecipe(recipeId: string): Promise<RecipeEntry> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const { data, error } = await client
      .from('recipes')
      .update({ status: 'FINALIZED' })
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

  async rejectRecipe(recipeId: string): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const { error } = await client
      .from('recipes')
      .update({ status: 'REJECTED' })
      .eq('id', recipeId);

    if (error) throw new Error(error.message);
  }
};
