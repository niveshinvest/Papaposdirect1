import { authService } from "./supabaseService";
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
      const response = await fetch("/api/admin/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...request,
          company_id: profile.company_id
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "AI Generation failed");
      }

      return await response.json();
    } catch (error: any) {
      console.error("Universal AI Service Error:", error);
      return { text: "", error: error.message };
    }
  }
};
