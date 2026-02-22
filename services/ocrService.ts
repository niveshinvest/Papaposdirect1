
import { GoogleGenAI, Type } from "@google/genai";
import { getSupabase, authService } from './supabaseService';

export const ocrService = {
  async processInvoice(file: File): Promise<string> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase connection required");
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async (evt) => {
        try {
          const base64 = (evt.target?.result as string).split(',')[1];
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
              parts: [
                { inlineData: { data: base64, mimeType: file.type } },
                { text: `Extract all procurement data from this invoice. 
                  Strictly find:
                  1. Vendor Name
                  2. Vendor GSTIN (Validate format 15 chars)
                  3. Invoice Date (YYYY-MM-DD)
                  4. Invoice Number
                  5. Recipient GSTIN
                  6. Line items (name, qty, unit, price, hsn)
                  7. Subtotal, CGST, SGST, IGST, Total Amount.
                  Provide a confidence score between 0 and 1 for the extraction.
                  Return ONLY JSON.` 
                }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  vendor_name: { type: Type.STRING },
                  vendor_gstin: { type: Type.STRING },
                  invoice_number: { type: Type.STRING },
                  invoice_date: { type: Type.STRING },
                  recipient_gstin: { type: Type.STRING },
                  total_amount: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        qty: { type: Type.NUMBER },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        hsn: { type: Type.STRING }
                      },
                      required: ['name', 'qty', 'price']
                    }
                  }
                },
                required: ['vendor_name', 'invoice_date', 'total_amount', 'items']
              }
            }
          });

          const extracted = JSON.parse(response.text || '{}');
          
          // Store result in staging
          const { data, error } = await client
            .from('ocr_invoice_results')
            .insert({
              company_id: profile.company_id,
              file_name: file.name,
              raw_response: { text: response.text },
              extracted_data: extracted,
              confidence_score: extracted.confidence || 0.5,
              status: 'PENDING_REVIEW'
            })
            .select()
            .single();

          if (error) throw new Error(error.message);
          resolve(data.id);
        } catch (err: any) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      reader.onerror = () => reject(new Error("File reading failed."));
      reader.readAsDataURL(file);
    });
  }
};
