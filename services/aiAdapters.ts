import { AIRequest, AIResponse, AIProvider } from "../types";
import { GoogleGenAI } from "@google/genai";

export interface AIAdapter {
  generateContent(request: AIRequest, config: AIProvider): Promise<AIResponse>;
}

export class GeminiAdapter implements AIAdapter {
  async generateContent(request: AIRequest, config: AIProvider): Promise<AIResponse> {
    try {
      // Use provided API key or fallback to environment
      const apiKey = config.api_key || process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) throw new Error("Gemini API Key missing");

      const ai = new GoogleGenAI({ apiKey });
      
      const contents = request.parts ? {
        parts: request.parts.map(p => {
          if (p.inline_data) {
            return {
              inlineData: {
                data: p.inline_data.data,
                mimeType: p.inline_data.mime_type
              }
            };
          }
          return { text: p.text || "" };
        })
      } : request.prompt || "";

      const response = await ai.models.generateContent({
        model: config.model || "gemini-3-pro-preview",
        contents: contents as any,
        config: {
          systemInstruction: request.system_prompt,
          temperature: request.temperature,
          maxOutputTokens: request.max_tokens,
          responseMimeType: request.response_mime_type as any,
          responseSchema: request.response_schema
        }
      });

      return { text: response.text || "" };
    } catch (error: any) {
      console.error("Gemini Adapter Error:", error);
      return { text: "", error: error.message };
    }
  }
}

export class OpenAIAdapter implements AIAdapter {
  async generateContent(request: AIRequest, config: AIProvider): Promise<AIResponse> {
    try {
      const apiKey = config.api_key;
      if (!apiKey) throw new Error("OpenAI API Key missing");

      const response = await fetch(config.base_url || "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            ...(request.system_prompt ? [{ role: "system", content: request.system_prompt }] : []),
            { role: "user", content: request.prompt }
          ],
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          response_format: request.response_mime_type === "application/json" ? { type: "json_object" } : undefined
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return { text: data.choices[0].message.content };
    } catch (error: any) {
      console.error("OpenAI Adapter Error:", error);
      return { text: "", error: error.message };
    }
  }
}

export class ClaudeAdapter implements AIAdapter {
  async generateContent(request: AIRequest, config: AIProvider): Promise<AIResponse> {
    try {
      const apiKey = config.api_key;
      if (!apiKey) throw new Error("Anthropic API Key missing");

      const response = await fetch(config.base_url || "https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: config.model,
          system: request.system_prompt,
          messages: [{ role: "user", content: request.prompt }],
          max_tokens: request.max_tokens || 4096,
          temperature: request.temperature
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return { text: data.content[0].text };
    } catch (error: any) {
      console.error("Claude Adapter Error:", error);
      return { text: "", error: error.message };
    }
  }
}

export class OpenRouterAdapter implements AIAdapter {
  async generateContent(request: AIRequest, config: AIProvider): Promise<AIResponse> {
    try {
      const apiKey = config.api_key;
      if (!apiKey) throw new Error("OpenRouter API Key missing");

      const response = await fetch(config.base_url || "https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://papapos.com",
          "X-Title": "PapaPOS"
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            ...(request.system_prompt ? [{ role: "system", content: request.system_prompt }] : []),
            { role: "user", content: request.prompt }
          ],
          temperature: request.temperature,
          max_tokens: request.max_tokens
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "OpenRouter Error");
      return { text: data.choices[0].message.content };
    } catch (error: any) {
      console.error("OpenRouter Adapter Error:", error);
      return { text: "", error: error.message };
    }
  }
}
