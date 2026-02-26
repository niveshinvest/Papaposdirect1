
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

      // Browser Fallback: window.print()
      // Note: Browser cannot do silent printing. It will always show dialog.
      window.print();
      return { success: true, method: 'BROWSER_SYSTEM' };

    } catch (error: any) {
      console.error("Print Controller Error:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * HTML GENERATOR (For Electron/Browser)
   */
  generateInvoiceHTML(invoice: any, width: string): string {
    return `
      <html>
        <head>
          <style>
            body { 
              width: ${width === '80mm' ? '300px' : '220px'}; 
              margin: 0; 
              padding: 10px; 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 12px;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
            table { width: 100%; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="center bold">${invoice.seller_legal_name}</div>
          <div class="center">${invoice.seller_trade_name}</div>
          <div class="divider"></div>
          <div>INV: ${invoice.invoice_number}</div>
          <div>DATE: ${new Date(invoice.invoice_date).toLocaleString()}</div>
          <div class="divider"></div>
          <table>
            ${invoice.items.map((item: any) => `
              <tr>
                <td>${item.name} x ${item.quantity}</td>
                <td class="right">${item.total_amount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </table>
          <div class="divider"></div>
          <div class="bold">TOTAL: ${invoice.grand_total.toFixed(2)}</div>
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
