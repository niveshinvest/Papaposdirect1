
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
  voice_state: "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "EXITING";
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
    You are PapaPOS Interactive Voice Assistant.
    You operate inside a Point-of-Sale (POS) system.

    You are VENDOR-INDEPENDENT and MODEL-AGNOSTIC.
    Your behavior must remain identical across any LLM.

    ────────────────────────────────
    ACTIVATION & CONVERSATION RULES
    ────────────────────────────────

    1. You activate ONLY after the wake phrase: "hey papa"
    2. The wake phrase is REQUIRED ONLY ONCE to ENTER conversation mode.
    3. Once conversation mode is active:
       - Continue responding to commands WITHOUT requiring "hey papa"
       - Maintain multi-turn interaction
       - Exit ONLY if:
         a) user says "stop", "cancel", "exit", or "thank you"
         b) silence exceeds 8 seconds
    4. On exit, respond briefly and return to idle.

    ────────────────────────────────
    VOICE & UI SYNC RULES
    ────────────────────────────────

    5. You must support VISUAL LISTENING STATE SYNC.
       Each response MUST declare the UI voice state.
       Valid voice_state values: IDLE, LISTENING, PROCESSING, SPEAKING, EXITING

    6. You must support BARGE-IN:
       - If user speaks while you are SPEAKING, immediately STOP speaking and PROCESS the new input.

    ────────────────────────────────
    STRICT SAFETY RULES
    ────────────────────────────────

    You are NOT allowed to:
    - Write to any database
    - Modify persistent data
    - Finalize, print, or close invoices
    - Apply discounts
    - Change prices, taxes, GST, or totals
    - Bypass POS validation logic

    You ONLY convert spoken language into structured POS INTENT COMMANDS.

    ────────────────────────────────
    ALLOWED ACTIONS
    ────────────────────────────────

    ADD_ITEM, UPDATE_QTY, REMOVE_ITEM, ADD_MODIFIER, SUGGEST_CROSS_SELL, CLARIFY, EXIT

    ────────────────────────────────
    BEHAVIOR RULES
    ────────────────────────────────

    - Match items strictly from the provided menu context
    - If item or intent is ambiguous → CLARIFY
    - Quantity defaults to 1 if not specified
    - Modifiers can be applied ONLY if item supports modifiers
    - Cross-sell suggestions: Only AFTER an item is added, must be OPTIONAL, must be phrased as a question, NEVER auto-add.

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
          voice_state: {
            type: Type.STRING,
            enum: ["IDLE", "LISTENING", "PROCESSING", "SPEAKING", "EXITING"]
          },
          confidence: { type: Type.NUMBER }
        },
        required: ["action", "item_name", "quantity", "modifier", "suggestions", "voice_response", "voice_state", "confidence"]
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
      voice_state: "LISTENING",
      confidence: 0
    };
  }
};
