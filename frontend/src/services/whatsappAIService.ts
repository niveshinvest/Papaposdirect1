import { aiGateway } from "./aiGateway";
import { AIRequest } from "../types";

export const whatsappAIService = {
  async parseOrder(message: string, company_id: string, outlet_id: string) {
    const prompt = `Convert this WhatsApp message into a structured POS order object: "${message}".
    
    Output format:
    {
      "items": [
        { "name": "item name", "qty": 1, "notes": "optional notes" }
      ],
      "customer": { "name": "optional name", "phone": "optional phone" }
    }`;

    const request: AIRequest = {
      task_type: "WHATSAPP_ORDER_PARSING",
      prompt,
      company_id,
      outlet_id,
      response_mime_type: "application/json",
      response_schema: {
        type: "OBJECT",
        properties: {
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                qty: { type: "NUMBER" },
                notes: { type: "STRING" }
              },
              required: ["name", "qty"]
            }
          },
          customer: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              phone: { type: "STRING" }
            }
          }
        },
        required: ["items"]
      }
    };

    const response = await aiGateway.runAI(request);
    if (response.error) throw new Error(response.error);
    return JSON.parse(response.text);
  }
};
