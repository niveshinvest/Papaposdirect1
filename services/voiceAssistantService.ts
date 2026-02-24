
import { GoogleGenAI, Type } from "@google/genai";
import { MenuItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface VoiceCommand {
  action: "ADD_ITEM" | "UPDATE_QTY" | "REMOVE_ITEM" | "ADD_MODIFIER" | "SUGGEST_CROSS_SELL" | "CLARIFY";
  item_name: string | null;
  quantity: number | null;
  modifier: string | null;
  suggestions: string[];
  confidence: number;
}

export const processVoiceInput = async (
  text: string,
  menuItems: MenuItem[]
): Promise<VoiceCommand> => {
  const menuContext = menuItems.map(item => ({
    name: item.name,
    category: item.category,
    price: item.price,
    has_modifiers: (item.modifiers?.length || 0) > 0
  }));

  const systemInstruction = `
    You are an AI voice assistant embedded inside a Point-of-Sale (POS) system.
    You are NOT allowed to write to the database.
    You are NOT allowed to modify prices, taxes, GST, discounts, or finalize invoices.
    You ONLY convert spoken text into structured POS commands.

    Your output MUST be valid JSON only.
    No explanations. No markdown. No extra text.

    Allowed actions:
    - ADD_ITEM
    - UPDATE_QTY
    - REMOVE_ITEM
    - ADD_MODIFIER
    - SUGGEST_CROSS_SELL
    - CLARIFY

    Rules:
    1. Match items strictly from the provided menu list.
    2. If item name is ambiguous, respond with CLARIFY.
    3. Never auto-add suggested items.
    4. Cross-sell suggestions must be optional and phrased as a question.
    5. Quantity defaults to 1 if not mentioned.
    6. Modifiers can only be applied if the item supports modifiers.
    7. If user intent is unclear, return CLARIFY.

    Menu Context: ${JSON.stringify(menuContext)}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            enum: ["ADD_ITEM", "UPDATE_QTY", "REMOVE_ITEM", "ADD_MODIFIER", "SUGGEST_CROSS_SELL", "CLARIFY"]
          },
          item_name: { type: Type.STRING, nullable: true },
          quantity: { type: Type.NUMBER, nullable: true },
          modifier: { type: Type.STRING, nullable: true },
          suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          confidence: { type: Type.NUMBER }
        },
        required: ["action", "item_name", "quantity", "modifier", "suggestions", "confidence"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}") as VoiceCommand;
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    return {
      action: "CLARIFY",
      item_name: null,
      quantity: null,
      modifier: null,
      suggestions: [],
      confidence: 0
    };
  }
};
