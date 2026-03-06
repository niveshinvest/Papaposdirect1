
import { universalAIService } from './UniversalAIService';

export const getBusinessInsights = async (salesData: any, menuItems: any) => {
  try {
    const response = await universalAIService.generateContent({
      prompt: `Analyze this restaurant data and provide business insights:
      Sales Data: ${JSON.stringify(salesData)}
      Menu Items: ${JSON.stringify(menuItems)}`,
      system_prompt: "You are an expert restaurant consultant. Provide 3 actionable, data-driven insights to improve profit and operations. Be concise.",
      response_mime_type: "application/json",
      response_schema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            description: { type: "STRING" },
            impact: { type: "STRING" }
          },
          required: ['title', 'description', 'impact']
        }
      }
    });

    if (response.error) throw new Error(response.error);
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Error fetching AI insights:", error);
    return [];
  }
};

export const getAIRecipe = async (dishName: string) => {
  try {
    const response = await universalAIService.generateContent({
      prompt: `Generate a standard commercial recipe for: ${dishName}. 
      Focus on primary raw materials (ingredients). 
      Provide precise commercial quantities (e.g., in kg, grams, ml, or units).`,
      system_prompt: "You are a professional chef. Provide ingredients for a single portion of this dish. Use standard commercial units (kg, gram, litre, ml, unit).",
      response_mime_type: "application/json",
      response_schema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            quantity: { type: "NUMBER" },
            unit: { type: "STRING" }
          },
          required: ['name', 'quantity', 'unit']
        }
      }
    });

    if (response.error) throw new Error(response.error);
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("AI Recipe Generation Error:", error);
    return [];
  }
};
