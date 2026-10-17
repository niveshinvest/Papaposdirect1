import { authService, getTenantAuthHeaders } from "./supabaseService";
import { API_BASE } from "./config";
import { AIRequest, AIResponse } from "../types";

export const universalAIService = {
  /**
   * Centralized AI gateway that routes requests through the server
   * to keep API keys secure and support multiple providers.
   */
  async generateContent(request: AIRequest): Promise<AIResponse> {
  const profile = await authService.getProfile();
  if (!profile?.company_id) throw new Error("Authentication required");

  try {
    const response = await fetch(`${API_BASE}/api/admin/generate`, {
      method: "POST",
      headers: await getTenantAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        ...request,
        company_id: profile.company_id
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || "AI Generation failed");
    }

    // 🔥 Normalize here
    return {
      text:
        data?.text ||
        data?.response ||
        data?.data ||
        JSON.stringify(data),
      error: null
    };

  } catch (error: any) {
    console.error("Universal AI Service Error:", error);
    return { text: "", error: error.message };
  }
},

 extractStructuredJSON(input: any) {
  let text = "";

  // Case 1: already string
  if (typeof input === "string") {
    text = input;
  }

  // Case 2: API response object
  else if (typeof input === "object") {
    text =
      input.text ||
      input.response ||
      JSON.stringify(input);
  }

  text = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("No JSON found in AI response");
  }

  return JSON.parse(match[0]);
}

 
};
