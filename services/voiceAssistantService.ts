
import { GoogleGenAI, Type } from "@google/genai";
import { MenuItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface VoiceCommand {
  intent: "add_item" | "remove_item" | "update_quantity" | "suggest_cross_sale" | "confirm_bill" | "ask_for_sleep" | "unknown";
  items: {
    name: string;
    quantity: number;
    modifiers: string[];
  }[];
  confidence: number;
  voice_response: string;
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
    You are a POS Voice Control AI integrated into a billing system.
    THIS PROMPT IS LOCKED. You must follow these rules exactly.

    ==============================
    🎯 CORE OBJECTIVE
    ==============================
    - Convert spoken user commands into structured POS actions.
    - Act immediately on commands.
    - If the user is idle for a set time, politely ask if they need further assistance before going idle.

    ==============================
    🧠 CONVERSATION STATE RULES
    ==============================
    States allowed: IDLE, LISTENING, PROCESSING, SPEAKING, EXECUTING, WAITING_FOR_CONFIRMATION

    - After processing any command, return to a state that implies you are ready for more.
    - If intent = "ask_for_sleep", prompt the user: "Do you need anything else or should I go to sleep?"

    ==============================
    🤖 AI PROVIDER INDEPENDENCE
    ==============================
    - Treat the AI engine as a black box.
    - Output format must remain consistent.

    ==============================
    📦 OUTPUT FORMAT (MANDATORY)
    ==============================
    Return ONLY valid JSON. No extra text.

    {
      "intent": "add_item | remove_item | update_quantity | suggest_cross_sale | confirm_bill | ask_for_sleep | unknown",
      "items": [
        {
          "name": "string",
          "quantity": number,
          "modifiers": []
        }
      ],
      "confidence": number,
      "voice_response": "string"
    }

    ==============================
    BEHAVIOR RULES
    ==============================
    - Match items strictly from the provided menu context.
    - If intent is unknown, ask for clarification.
    - Quantity defaults to 1.
    - Cross-sell suggestions: Only AFTER an item is added, must be OPTIONAL, phrased as a question.

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
          intent: {
            type: Type.STRING,
            enum: ["add_item", "remove_item", "update_quantity", "suggest_cross_sale", "confirm_bill", "ask_for_sleep", "unknown"]
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                modifiers: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["name", "quantity", "modifiers"]
            }
          },
          confidence: { type: Type.NUMBER },
          voice_response: { type: Type.STRING }
        },
        required: ["intent", "items", "confidence", "voice_response"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}") as VoiceCommand;
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    return {
      intent: "unknown",
      items: [],
      confidence: 0,
      voice_response: "Please repeat, I didn't catch that."
    };
  }
};
