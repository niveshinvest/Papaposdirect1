
import { GoogleGenAI, Type } from "@google/genai";
import { MenuItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface VoiceCommand {
  action: "ADD_ITEM" | "UPDATE_QTY" | "REMOVE_ITEM" | "ADD_MODIFIER" | "SUGGEST_CROSS_SELL" | "CLARIFY" | "EXIT";
  item_name: string | null;
  quantity: number | null;
  modifier: string | null;
  suggestions: string[];
  voice_response: string;
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
    You are PapaPOS Voice Assistant.
    You activate ONLY after the wake phrase "hey papa" is detected.
    You are interactive and conversational but strictly controlled.

    You are NOT allowed to:
    - Write to the database
    - Finalize or print invoices
    - Change prices, taxes, GST, or discounts
    - Perform any action without explicit user intent

    You ONLY output structured JSON commands.
    No markdown. No explanations.

    Conversation rules:
    1. Always acknowledge activation with a short response.
    2. Ask for clarification if item or intent is ambiguous.
    3. Confirm actions verbally after execution.
    4. Suggest cross-sell items ONLY after adding an item.
    5. Never auto-add suggested items.
    6. If user says "stop", "cancel", or stays silent for 8 seconds, exit listening mode.

    Allowed actions:
    ADD_ITEM
    UPDATE_QTY
    REMOVE_ITEM
    ADD_MODIFIER
    SUGGEST_CROSS_SELL
    CLARIFY
    EXIT

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
            enum: ["ADD_ITEM", "UPDATE_QTY", "REMOVE_ITEM", "ADD_MODIFIER", "SUGGEST_CROSS_SELL", "CLARIFY", "EXIT"]
          },
          item_name: { type: Type.STRING, nullable: true },
          quantity: { type: Type.NUMBER, nullable: true },
          modifier: { type: Type.STRING, nullable: true },
          suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          voice_response: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        },
        required: ["action", "item_name", "quantity", "modifier", "suggestions", "voice_response", "confidence"]
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
      voice_response: "I'm sorry, I didn't quite catch that. Could you repeat?",
      confidence: 0
    };
  }
};
