
import { getSupabase, authService, tenantContext } from './supabaseService';
import { universalAIService } from './UniversalAIService';

export const ocrService = {
  async processInvoice(file: File): Promise<string> {
    const { company_id } = await tenantContext.require();
    const client = getSupabase();
    if (!client) throw new Error("Supabase connection required");

    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async (evt) => {
        try {
          const base64 = (evt.target?.result as string).split(',')[1];
          
          // Fetch existing inventory for matching context
          const { data: inventoryItems } = await client
            .from('inventory')
            .select('id, name')
            .eq('company_id', company_id);
            
          const { data: aliases } = await client
            .from('inventory_aliases')
            .select('inventory_id, alias_name')
            .eq('company_id', company_id);

          const inventoryContext = (inventoryItems || []).map(item => ({
            id: item.id,
            name: item.name,
            aliases: (aliases || []).filter(a => a.inventory_id === item.id).map(a => a.alias_name)
          }));

          const response = await universalAIService.generateContent({
            parts: [
              { inline_data: { data: base64, mime_type: file.type } },
              { text: `Extract all procurement data from this invoice. 
                  
                  CONTEXT: Existing Inventory Items in PapaPOS:
                  ${JSON.stringify(inventoryContext)}

                  Strictly find:
                  1. Vendor Name
                  2. Vendor GSTIN (Validate format 15 chars)
                  3. Invoice Date (YYYY-MM-DD)
                  4. Invoice Number
                  5. Recipient GSTIN
                  6. Line items (name, qty, unit, price, hsn)
                  7. Subtotal, CGST, SGST, IGST, Total Amount.

                  MATCHING RULES:
                  - For each line item, check if it matches an existing inventory item from the CONTEXT above.
                  - Use exact match, case-insensitive match, or fuzzy similarity.
                  - If a high-confidence match is found, return the 'matched_inventory_id'.
                  - If NO match is found, set 'matched_inventory_id' to null and provide a 'suggested_inventory_name' from the existing list if there's a close one, otherwise suggest a clean name for a new item.
                  - DO NOT create new IDs.

                  Provide a confidence score between 0 and 1 for the extraction.
                  Return ONLY JSON.` 
                }
            ],
            response_mime_type: "application/json",
            response_schema: {
              type: "OBJECT",
              properties: {
                vendor_name: { type: "STRING" },
                vendor_gstin: { type: "STRING" },
                invoice_number: { type: "STRING" },
                invoice_date: { type: "STRING" },
                recipient_gstin: { type: "STRING" },
                total_amount: { type: "NUMBER" },
                confidence: { type: "NUMBER" },
                items: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      matched_inventory_id: { type: "STRING" },
                      suggested_inventory_name: { type: "STRING" },
                      qty: { type: "NUMBER" },
                      unit: { type: "STRING" },
                      price: { type: "NUMBER" },
                      hsn: { type: "STRING" }
                    },
                    required: ['name', 'qty', 'price']
                  }
                }
              },
              required: ['vendor_name', 'invoice_date', 'total_amount', 'items']
            }
          });

          if (response.error) throw new Error(response.error);

          const extracted = JSON.parse(response.text || '{}');
          
          // Store result in staging
          const { data, error } = await client
            .from('ocr_invoice_results')
            .insert({
              company_id: company_id,
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
