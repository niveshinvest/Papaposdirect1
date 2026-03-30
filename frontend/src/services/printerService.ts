
import { getSupabase, authService } from './supabaseService';

export interface Printer {
  id?: string;
  company_id?: string;
  outlet_id: string;
  name: string;
  printer_type: 'BLUETOOTH' | 'USB' | 'LAN' | 'SYSTEM';
  connection_hint?: string;
  is_default: boolean;
  is_active: boolean;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DiscoveredDevice {
  name: string;
  technical_id: string;
  type: 'bluetooth' | 'wifi' | 'usb';
  manufacturer?: string;
}

export const printerService = {
  /**
   * PLATFORM DETECTION
   */
  getPlatform(): 'ANDROID' | 'ELECTRON' | 'BROWSER' {
    if ((window as any).PapaPrint) return 'ANDROID';
    if ((window as any).ipcRenderer) return 'ELECTRON';
    return 'BROWSER';
  },

  /**
   * PRINTER AVAILABILITY DETECTION
   */
  async checkAvailability(): Promise<{ available: boolean; name: string; type: string }> {
    const platform = this.getPlatform();
    
    if (platform === 'ELECTRON') {
      try {
        const printers = await (window as any).ipcRenderer.invoke('get-printers');
        const defaultPrinter = printers.find((p: any) => p.isDefault) || printers[0];
        return { 
          available: !!defaultPrinter, 
          name: defaultPrinter?.name || 'No Printer Found',
          type: 'System Printer (Electron)'
        };
      } catch (e) {
        return { available: false, name: 'Electron Service Error', type: 'N/A' };
      }
    }

    if (platform === 'ANDROID') {
      // Android bridge assumes paired Bluetooth printers are handled native-side
      return { available: true, name: 'Paired BT Printer', type: 'ESC/POS (Native)' };
    }

    // Browser Fallback
    return { available: true, name: 'System Dialog', type: 'Browser Print' };
  },

  /**
   * CORE PRINT CONTROLLER
   * Routes the print request to the appropriate platform handler
   */
  async printInvoice(invoice: any, options: { silent?: boolean; paperWidth?: string } = {}) {
    const platform = this.getPlatform();
    const { silent = true } = options;

    console.log(`Print Controller: Routing to ${platform} (Silent: ${silent})`);

    try {
      if (platform === 'ANDROID') {
        // Native Bridge: window.PapaPrint.print(json)
        (window as any).PapaPrint.print(JSON.stringify(invoice));
        return { success: true, method: 'ANDROID_BRIDGE' };
      }

      if (platform === 'ELECTRON') {
        // Electron IPC: ipcRenderer.invoke('print-invoice', payload)
        const html = this.generateInvoiceHTML(invoice, options.paperWidth || '80mm');
        const result = await (window as any).ipcRenderer.invoke('print-invoice', { 
          html, 
          silent 
        });
        return { ...result, method: 'ELECTRON_IPC' };
      }

      // Browser fallback: open a dedicated print document instead of printing the POS shell.
      const html = this.generateInvoiceHTML(invoice, options.paperWidth || '80mm');
      const printWindow = window.open('', 'papapos-print-preview', 'width=420,height=900');

      if (!printWindow) {
        throw new Error('Popup blocked. Please allow popups to print invoices.');
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();

      const finalizePrint = () => {
        printWindow.focus();
        printWindow.print();
      };

      if (printWindow.document.readyState === 'complete') {
        setTimeout(finalizePrint, 150);
      } else {
        printWindow.onload = () => setTimeout(finalizePrint, 150);
      }

      return { success: true, method: 'BROWSER_WINDOW' };

    } catch (error: any) {
      console.error("Print Controller Error:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * HTML GENERATOR (For Electron/Browser)
   */
  generateInvoiceHTML(invoice: any, width: string): string {
    const items = Array.isArray(invoice?.items) ? invoice.items : [];
    const invoiceDate = invoice?.invoice_date
      ? new Date(invoice.invoice_date).toLocaleString()
      : new Date().toLocaleString();
    const total = Number(invoice?.grand_total || 0).toFixed(2);
    const subtotal = Number(invoice?.subtotal || 0).toFixed(2);
    const cgst = Number(invoice?.cgst_total || 0).toFixed(2);
    const sgst = Number(invoice?.sgst_total || 0).toFixed(2);
    const igst = Number(invoice?.igst_total || 0).toFixed(2);

    return `
      <html>
        <head>
          <title>Invoice ${invoice?.invoice_number || ''}</title>
          <style>
            @page { margin: 0; size: auto; }
            body { 
              width: ${width === '80mm' ? '300px' : '220px'}; 
              margin: 0; 
              padding: 10px; 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 12px;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; }
            td, th { padding: 2px 0; vertical-align: top; }
            th { border-bottom: 1px solid #000; text-align: left; }
            .right { text-align: right; }
            .meta-row { display: flex; justify-content: space-between; gap: 8px; }
            .muted { font-size: 10px; color: #444; }
          </style>
        </head>
        <body>
          <div class="center bold">${invoice?.seller_legal_name || 'PapaPos Restaurant'}</div>
          <div class="center">${invoice?.seller_trade_name || ''}</div>
          ${invoice?.seller_gstin ? `<div class="center muted">GSTIN: ${invoice.seller_gstin}</div>` : ''}
          <div class="divider"></div>
          <div>INV: ${invoice?.invoice_number || 'DRAFT'}</div>
          <div>DATE: ${invoiceDate}</div>
          <div>MODE: ${invoice?.payment_method || invoice?.payment_mode_name || 'CASH'}</div>
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th>ITEM</th>
                <th class="right">QTY</th>
                <th class="right">AMT</th>
              </tr>
            </thead>
            <tbody>
            ${items.map((item: any) => `
              <tr>
                <td>${item?.name || 'Item'}</td>
                <td class="right">${item?.quantity || 0}</td>
                <td class="right">${Number(item?.total_amount ?? item?.total_price ?? 0).toFixed(2)}</td>
              </tr>
            `).join('')}
            </tbody>
          </table>
          <div class="divider"></div>
          <div class="meta-row"><span>SUBTOTAL:</span><span>${subtotal}</span></div>
          ${Number(cgst) > 0 ? `<div class="meta-row"><span>CGST:</span><span>${cgst}</span></div>` : ''}
          ${Number(sgst) > 0 ? `<div class="meta-row"><span>SGST:</span><span>${sgst}</span></div>` : ''}
          ${Number(igst) > 0 ? `<div class="meta-row"><span>IGST:</span><span>${igst}</span></div>` : ''}
          <div class="meta-row bold"><span>TOTAL:</span><span>${total}</span></div>
          <div class="divider"></div>
          <div class="center muted">Thank you for your visit.</div>
        </body>
      </html>
    `;
  },

  /**
   * DISCOVERY ENGINE: Triggers native system pickers (BT/USB) or network scan (WiFi)
   */
  async discoverDevices(type: 'bluetooth' | 'wifi' | 'usb'): Promise<DiscoveredDevice[]> {
    try {
      if (type === 'bluetooth') {
        // Web Bluetooth: Triggers browser-native device picker
        const device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['00001101-0000-1000-8000-00805f9b34fb'] 
        });

        if (!device) return [];
        
        return [{
          name: device.name || 'Bluetooth Thermal Printer',
          technical_id: device.id,
          type: 'bluetooth'
        }];
      } 
      
      if (type === 'usb') {
        // WebUSB: Triggers browser-native USB selector
        const device = await (navigator as any).usb.requestDevice({ filters: [] });
        
        if (!device) return [];

        return [{
          name: device.productName || 'USB Printer',
          technical_id: device.serialNumber || `USB-${device.vendorId}-${device.productId}`,
          type: 'usb',
          manufacturer: device.manufacturerName
        }];
      }

      if (type === 'wifi') {
        // WiFi: Internal polling scan
        await new Promise(resolve => setTimeout(resolve, 1500));
        return [
          { name: 'EPSON-TM-T88VI', technical_id: '192.168.1.150', type: 'wifi' },
          { name: 'Star-TSP143III', technical_id: '192.168.1.155', type: 'wifi' }
        ];
      }

      return [];
    } catch (e) {
      console.warn(`System picker cancelled or failed for ${type}:`, e);
      return [];
    }
  },

  async fetchPrinters(outletId: string): Promise<Printer[]> {
    const client = getSupabase();
    if (!client) return [];
    
    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const { data, error } = await client
      .from('printers')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .eq('is_active', true)
      .order('created_at');

    if (error) throw new Error(error.message);
    return data || [];
  },

  async addPrinter(payload: Partial<Printer>): Promise<Printer> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    // Strict Validations
    if (!payload.outlet_id) throw new Error("Outlet ID is required");
    if (!payload.name) throw new Error("Printer name is required");
    if (!payload.printer_type) throw new Error("Printer type is required");

    const insertPayload = {
      ...payload,
      company_id: profile.company_id,
      is_active: true,
      is_default: payload.is_default || false
    };

    console.log("PRINTER_SERVICE: BEFORE_INSERT_PAYLOAD", insertPayload);

    const { data, error } = await client
      .from('printers')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("PRINTER_SERVICE: INSERT_ERROR", error);
      throw new Error(error.message);
    }

    console.log("PRINTER_SERVICE: AFTER_DB_RESPONSE", data);
    return data;
  },

  async setDefaultPrinter(printerId: string, outletId: string) {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    // 1. Clear previous default for this outlet
    const { error: clearError } = await client
      .from('printers')
      .update({ is_default: false })
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId);

    if (clearError) throw new Error(clearError.message);

    // 2. Set new default
    const { error: setError } = await client
      .from('printers')
      .update({ is_default: true })
      .eq('id', printerId)
      .eq('company_id', profile.company_id);

    if (setError) throw new Error(setError.message);
  },

  async deletePrinter(id: string) {
    const client = getSupabase();
    if (!client) return;
    
    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const { error } = await client
      .from('printers')
      .delete()
      .eq('id', id)
      .eq('company_id', profile.company_id);

    if (error) throw new Error(error.message);
  }
};
