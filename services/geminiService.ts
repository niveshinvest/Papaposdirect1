
import { GoogleGenAI, Type } from "@google/genai";

export const getBusinessInsights = async (salesData: any, menuItems: any) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Analyze this restaurant data and provide business insights:
      Sales Data: ${JSON.stringify(salesData)}
      Menu Items: ${JSON.stringify(menuItems)}`,
      config: {
        systemInstruction: "You are an expert restaurant consultant. Provide 3 actionable, data-driven insights to improve profit and operations. Be concise.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              impact: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] }
            },
            required: ['title', 'description', 'impact']
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Error fetching AI insights:", error);
    return [];
  }
};

export const getAIRecipe = async (dishName: string) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Generate a standard commercial recipe for: ${dishName}. 
      Focus on primary raw materials (ingredients). 
      Provide precise commercial quantities (e.g., in kg, grams, ml, or units).`,
      config: {
        systemInstruction: "You are a professional chef. Provide ingredients for a single portion of this dish. Use standard commercial units (kg, gram, litre, ml, unit).",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              unit: { type: Type.STRING }
            },
            required: ['name', 'quantity', 'unit']
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("AI Recipe Generation Error:", error);
    return [];
  }
};