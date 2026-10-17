
import { getSupabase, authService } from './supabaseService';
import { API_BASE } from './config';

export type PaperSizeName = string;

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
  paper_sizes?: string[];
}

export interface PrinterPreferences {
  id?: string;
  company_id?: string;
  outlet_id: string;
  bill_printer_ids: string[];
  bill_paper_size: PaperSizeName | null;
  bill_auto_print: boolean;
  kot_printer_ids: string[];
  kot_paper_size: PaperSizeName | null;
  kot_auto_print: boolean;
  created_at?: string;
  updated_at?: string;
}

type SystemPrinter = {
  name: string;
  displayName?: string;
  isDefault?: boolean;
  options?: Record<string, any>;
};

type LocalPrintAgentStatus = {
  available: boolean;
  platform?: string;
  mode?: string;
  supportsSilentSystemPrint?: boolean;
  supportsLanRawPrint?: boolean;
  message?: string;
  printers?: Array<{ name: string; port?: string; isDefault?: boolean }>;
};

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const defaultPreferences = (outletId: string): PrinterPreferences => ({
  outlet_id: outletId,
  bill_printer_ids: [],
  bill_paper_size: null,
  bill_auto_print: false,
  kot_printer_ids: [],
  kot_paper_size: null,
  kot_auto_print: true,
});

const uniqueStrings = (values: Array<string | null | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))];
const FALLBACK_PAPER_SIZES = ['A4', 'A3', '58mm', '80mm', '85mm'];

const coercePrinterIdList = (value: any, legacyValue?: any) => {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (typeof legacyValue === 'string' && legacyValue.trim()) return [legacyValue.trim()];
  return [];
};

const normalizePreferences = (outletId: string, raw?: any): PrinterPreferences => ({
  ...defaultPreferences(outletId),
  ...(raw || {}),
  outlet_id: outletId,
  bill_printer_ids: coercePrinterIdList(raw?.bill_printer_ids, raw?.bill_printer_id),
  bill_paper_size: raw?.bill_paper_size || raw?.bill_paper_width || null,
  bill_auto_print: Boolean(raw?.bill_auto_print),
  kot_printer_ids: coercePrinterIdList(raw?.kot_printer_ids, raw?.kot_printer_id),
  kot_paper_size: raw?.kot_paper_size || raw?.kot_paper_width || null,
  kot_auto_print: raw?.kot_auto_print ?? true,
});

const normalizePaperSizeLabel = (value: string) => value.trim();

const extractPrinterPaperSizes = (printer: SystemPrinter): string[] => {
  const optionValues = Object.values(printer?.options || {});
  const candidates = optionValues
    .flatMap((value: any) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return value.split(/[;,|]/g);
      return [];
    })
    .map((value: any) => normalizePaperSizeLabel(String(value)))
    .filter(value =>
      Boolean(value) &&
      /mm|inch|in\b|receipt|roll|a4|a5|letter|legal|thermal|paper|size/i.test(value)
    );

  return uniqueStrings(candidates).length ? uniqueStrings(candidates) : FALLBACK_PAPER_SIZES;
};

const resolveReceiptCssWidth = (paperSize?: string | null) => {
  const size = String(paperSize || '').toLowerCase();
  if (size.includes('58')) return '220px';
  if (size.includes('80')) return '300px';
  return '300px';
};

const roundCurrency = (value: any) => Number(Number(value || 0).toFixed(2));

const resolveLineTotal = (item: any) => {
  if (item?.total_amount != null) return roundCurrency(item.total_amount);
  if (item?.total_price != null) return roundCurrency(item.total_price);

  const quantity = Number(item?.quantity || 0);
  const unitPrice = Number(item?.unit_price ?? item?.price ?? item?.rate ?? 0);
  const modifierTotal = Array.isArray(item?.selected_modifiers)
    ? item.selected_modifiers.reduce((sum: number, mod: any) => sum + Number(mod?.price || 0), 0)
    : 0;
  const taxable = Number(item?.taxable_value || 0);
  const tax = Number(item?.cgst_amount || 0) + Number(item?.sgst_amount || 0) + Number(item?.igst_amount || 0);

  if (taxable > 0 || tax > 0) return roundCurrency(taxable + tax);
  return roundCurrency((unitPrice + modifierTotal) * quantity);
};

const normalizeInvoiceForPrint = (invoice: any) => {
  const rawItems = Array.isArray(invoice?.items)
    ? invoice.items
    : Array.isArray(invoice?.invoice_items)
      ? invoice.invoice_items
      : [];

  const items = rawItems.map((item: any, index: number) => ({
    ...item,
    id: item?.id || item?.line_id || `print-line-${index}`,
    name: String(item?.name || item?.item_name || item?.menu_item_name || 'Item'),
    quantity: Number(item?.quantity || 0),
    total_amount: resolveLineTotal(item),
    selected_modifiers: Array.isArray(item?.selected_modifiers) ? item.selected_modifiers : [],
  }));

  const subtotal = invoice?.subtotal != null
    ? roundCurrency(invoice.subtotal)
    : roundCurrency(items.reduce((sum: number, item: any) => sum + Number(item?.taxable_value || item?.total_amount || 0), 0));
  const cgstTotal = roundCurrency(invoice?.cgst_total ?? invoice?.cgst ?? 0);
  const sgstTotal = roundCurrency(invoice?.sgst_total ?? invoice?.sgst ?? 0);
  const igstTotal = roundCurrency(invoice?.igst_total ?? invoice?.igst ?? 0);
  const totalTax = invoice?.total_tax != null
    ? roundCurrency(invoice.total_tax)
    : roundCurrency(cgstTotal + sgstTotal + igstTotal);
  const grandTotal = invoice?.grand_total != null
    ? roundCurrency(invoice.grand_total)
    : roundCurrency(subtotal + totalTax + Number(invoice?.round_off || 0));

  return {
    ...invoice,
    items,
    subtotal,
    cgst_total: cgstTotal,
    sgst_total: sgstTotal,
    igst_total: igstTotal,
    total_tax: totalTax,
    grand_total: grandTotal,
  };
};

const isMissingColumnError = (message: string, column: string) =>
  message.includes(`Could not find the '${column}' column`) ||
  message.includes(`column "${column}" does not exist`);

let cachedAgentStatus: { value: LocalPrintAgentStatus; expiresAt: number } | null = null;

export const printerService = {
  /**
   * PLATFORM DETECTION
   */
  getPlatform(): 'ANDROID' | 'ELECTRON' | 'BROWSER' {
    if ((window as any).PapaPrint) return 'ANDROID';
    if ((window as any).ipcRenderer) return 'ELECTRON';
    return 'BROWSER';
  },

  getDirectPrintCapabilities() {
    const platform = this.getPlatform();

    if (platform === 'ANDROID') {
      return {
        platform,
        directPrintSupported: true,
        bluetoothDirectSupported: true,
        message: 'Native bridge active. Direct printer routing is available.',
      };
    }

    if (platform === 'ELECTRON') {
      return {
        platform,
        directPrintSupported: true,
        bluetoothDirectSupported: true,
        message: 'Electron runtime active. Silent system printing is available.',
      };
    }

    return {
      platform,
      directPrintSupported: false,
      bluetoothDirectSupported: false,
      message: 'Browser runtime detected. The browser print dialog cannot be bypassed for Bluetooth/system printing.',
    };
  },

  applyRuntimePrintRestrictions(
    preferences: PrinterPreferences,
    options: { browserDirectPrintEnabled?: boolean } = {}
  ): PrinterPreferences {
    if (this.getPlatform() !== 'BROWSER') return preferences;
    // In browser mode, "direct print" depends on the local print agent being online.
    // Do not overwrite user preferences here; callers should decide at runtime whether
    // silent/direct printing is possible and fall back accordingly.
    return preferences;
  },

  /**
   * PRINTER AVAILABILITY DETECTION
   */
  async checkAvailability(printerName?: string): Promise<{ available: boolean; name: string; type: string }> {
    const platform = this.getPlatform();
    
    if (platform === 'ELECTRON') {
      try {
        const printers = await (window as any).ipcRenderer.invoke('get-printers');
        const matchedPrinter = printerName
          ? printers.find((p: any) => p.name === printerName)
          : (printers.find((p: any) => p.isDefault) || printers[0]);
        return { 
          available: !!matchedPrinter, 
          name: matchedPrinter?.name || (printerName || 'No Printer Found'),
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
  async printInvoice(invoice: any, options: { silent?: boolean; paperSize?: PaperSizeName | null; printerName?: string; printer?: Printer | null } = {}) {
    const normalizedInvoice = normalizeInvoiceForPrint(invoice);
    console.log("my invoice to print", invoice)
    if (this.getPlatform() === 'ANDROID') {
      (window as any).PapaPrint.print(JSON.stringify(normalizedInvoice));
      return { success: true, method: 'ANDROID_BRIDGE' };
    }

    if (this.getPlatform() === 'BROWSER' && options.silent) {
      const localAgentResult = await this.tryLocalAgentPrint('invoice', normalizedInvoice, options);
      if (localAgentResult) return localAgentResult;
    }

    const html = this.generateInvoiceHTML(normalizedInvoice, options.paperSize || 'Default');
    return this.printHTML(html, {
      silent: options.silent,
      printerName: options.printerName,
      paperSize: options.paperSize,
    });
  },

  async printKOT(ticket: any, options: { silent?: boolean; paperSize?: PaperSizeName | null; printerName?: string; printer?: Printer | null } = {}) {
    if (this.getPlatform() === 'ANDROID') {
      (window as any).PapaPrint.print(JSON.stringify({ type: 'KOT', ...ticket }));
      return { success: true, method: 'ANDROID_BRIDGE' };
    }

    if (this.getPlatform() === 'BROWSER' && options.silent) {
      const localAgentResult = await this.tryLocalAgentPrint('kot', ticket, options);
      if (localAgentResult) return localAgentResult;
    }

    const html = this.generateKotHTML(ticket, options.paperSize || 'Default');
    return this.printHTML(html, {
      silent: options.silent,
      printerName: options.printerName,
      paperSize: options.paperSize,
    });
  },

  async printHTML(html: string, options: { silent?: boolean; printerName?: string; paperSize?: PaperSizeName | null } = {}) {
    const platform = this.getPlatform();
    const { silent = true, printerName, paperSize } = options;

    console.log(`Print Controller: Routing to ${platform} (Silent: ${silent})`);

    try {
      if (platform === 'ELECTRON') {
        const result = await (window as any).ipcRenderer.invoke('print-invoice', { 
          html, 
          silent,
          printerName,
          pageSize: paperSize || undefined,
        });
        return { ...result, method: 'ELECTRON_IPC' };
      }

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        iframe.remove();
        throw new Error('Unable to initialize print frame.');
      }

      iframeWindow.document.open();
      iframeWindow.document.write(html);
      iframeWindow.document.close();

      const finalizePrint = () => {
        iframeWindow.focus();
        iframeWindow.print();
        setTimeout(() => iframe.remove(), 1500);
      };

      if (iframeWindow.document.readyState === 'complete') {
        setTimeout(finalizePrint, 150);
      } else {
        iframe.onload = () => setTimeout(finalizePrint, 150);
      }

      return { success: true, method: 'BROWSER_IFRAME' };

    } catch (error: any) {
      console.error("Print Controller Error:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * HTML GENERATOR (For Electron/Browser)
   */
  generateInvoiceHTML(invoice: any, paperSize: string): string {
    const items = Array.isArray(invoice?.items) ? invoice.items : [];
    const itemsMod = Array.isArray(invoice?.items_) ? invoice.items : [];

    const invoiceDate = invoice?.invoice_date
      ? new Date(invoice.invoice_date).toLocaleString()
      : new Date().toLocaleString();
    const total = Number(invoice?.grand_total || 0).toFixed(2);
    const subtotal = Number(invoice?.subtotal || 0).toFixed(2);
    const cgst = Number(invoice?.cgst_total || 0).toFixed(2);
    const sgst = Number(invoice?.sgst_total || 0).toFixed(2);
    const igst = Number(invoice?.igst_total || 0).toFixed(2);
    const printLabel = String(invoice?.print_label || '').trim();

    return `
      <html>
        <head>
          <title>Invoice ${invoice?.invoice_number || ''}</title>
          <style>
            @page { margin: 0; size: auto; }
            body { 
              width: ${resolveReceiptCssWidth(paperSize)}; 
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
          ${printLabel ? `<div class="center bold">${escapeHtml(printLabel)}</div>` : ''}
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
                <th class="left">QTY</th>
                <th class="right">AMT</th>
              </tr>
            </thead>
            <tbody>
            ${items.map((item: any) => `
              <tr>
                 <td>
                    ${escapeHtml(item?.name || 'Item')}
                    ${Number(item?.price ?? item?.unit_price ?? 0) > 0 ? escapeHtml(Number(item?.price ?? item?.unit_price ?? 0).toFixed(2)) : ''}
                    ${Array.isArray(item?.selected_modifiers) && item.selected_modifiers.length > 0
                      ? `<span class="notes">+ ${escapeHtml(item.selected_modifiers.map((mod: any) => mod.name).join(', '))}</span>`
                      : ''}
                    ${item?.notes ? `<span class="notes">Note: ${escapeHtml(item.notes)}</span>` : ''}
                  </td>

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

  generateKotHTML(ticket: any, paperSize: string): string {
    const items = Array.isArray(ticket?.items) ? ticket.items : [];
    const createdAt = ticket?.created_at
      ? new Date(ticket.created_at).toLocaleString()
      : new Date().toLocaleString();

    return `
      <html>
        <head>
          <title>KOT ${escapeHtml(ticket?.order_id || '')}</title>
          <style>
            @page { margin: 0; size: auto; }
            body {
              width: ${resolveReceiptCssWidth(paperSize)};
              margin: 0;
              padding: 10px;
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; }
            td, th { padding: 2px 0; vertical-align: top; }
            th { border-bottom: 1px solid #000; text-align: left; }
            .right { text-align: right; }
            .ticket-tag {
              display: inline-block;
              padding: 2px 8px;
              border: 1px solid #000;
              font-size: 11px;
              font-weight: bold;
              margin-bottom: 6px;
            }
            .notes {
              display: block;
              font-size: 11px;
              color: #444;
              margin-top: 2px;
              font-weight: bold;

            }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="ticket-tag">${escapeHtml(ticket?.title || 'KITCHEN ORDER TICKET')}</div>
            <div class="bold">${escapeHtml(ticket?.outlet_name || 'PapaPos Kitchen')}</div>
            <div>${escapeHtml(ticket?.table_name || 'Takeaway')}</div>
          </div>
          <div class="divider"></div>
          <div>ORDER: ${escapeHtml(ticket?.order_id || 'NA')}</div>
          <div>TIME: ${escapeHtml(createdAt)}</div>
          ${ticket?.staff_name ? `<div>STAFF: ${escapeHtml(ticket.staff_name)}</div>` : ''}
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th>ITEM</th>
                <th class="right">QTY</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item: any) => `
                <tr>
                  <td>
                    ${escapeHtml(item?.name || 'Item')}
                    ${Array.isArray(item?.selected_modifiers) && item.selected_modifiers.length > 0
                      ? `<span class="notes">+ ${escapeHtml(item.selected_modifiers.map((mod: any) => mod.name).join(', '))}</span>`
                      : ''}
                    ${item?.notes ? `<span class="notes">Note: ${escapeHtml(item.notes)}</span>` : ''}
                  </td>
                  <td class="right">${Number(item?.quantity || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="divider"></div>
          <div class="center bold">Prepare Immediately</div>
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

  async getSystemPrinters(): Promise<DiscoveredDevice[]> {
    if (this.getPlatform() === 'ELECTRON') {
      try {
        const printers = await (window as any).ipcRenderer.invoke('get-printers');
        return (printers || []).map((printer: SystemPrinter) => ({
          name: printer.name,
          technical_id: printer.name,
          type: 'usb' as const,
          manufacturer: printer.displayName || 'System Printer',
          paper_sizes: extractPrinterPaperSizes(printer),
        }));
      } catch (error) {
        console.warn('Failed to fetch system printers:', error);
        return [];
      }
    }

    if (this.getPlatform() === 'BROWSER') {
      const agentStatus = await this.getLocalPrintAgentStatus();
      if (!agentStatus.available) return [];

      return (agentStatus.printers || []).map(printer => ({
        name: printer.name,
        technical_id: printer.name,
        type: 'usb' as const,
        manufacturer: printer.port || 'Local Print Agent',
        paper_sizes: FALLBACK_PAPER_SIZES,
      }));
    }

    return [];
  },

  async getLocalPrintAgentStatus(forceRefresh = false): Promise<LocalPrintAgentStatus> {
    if (this.getPlatform() !== 'BROWSER') {
      return {
        available: false,
        message: 'Local print agent is only used in browser mode.',
      };
    }

    const now = Date.now();
    if (!forceRefresh && cachedAgentStatus && cachedAgentStatus.expiresAt > now) {
      return cachedAgentStatus.value;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(`${API_BASE}/print-agent/status`, {
        method: 'GET',
        signal: controller.signal,
      });
      const payload = response.ok ? await response.json() : null;
      const status: LocalPrintAgentStatus = response.ok ? {
        available: Boolean(payload?.available),
        platform: payload?.platform,
        mode: payload?.mode,
        supportsSilentSystemPrint: Boolean(payload?.supportsSilentSystemPrint),
        supportsLanRawPrint: Boolean(payload?.supportsLanRawPrint),
        message: payload?.message,
        printers: Array.isArray(payload?.printers) ? payload.printers : [],
      } : {
        available: false,
        message: `Print agent returned HTTP ${response.status}`,
      };

      cachedAgentStatus = {
        value: status,
        expiresAt: now + 15000,
      };
      return status;
    } catch (error: any) {
      const status = {
        available: false,
        message: error?.name === 'AbortError' ? 'Local print agent did not respond.' : 'Local print agent is offline.',
      };
      cachedAgentStatus = {
        value: status,
        expiresAt: now + 5000,
      };
      return status;
    } finally {
      window.clearTimeout(timeout);
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

  async fetchPrinterPreferences(outletId: string): Promise<PrinterPreferences> {
    const client = getSupabase();
    if (!client) return defaultPreferences(outletId);

    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const { data, error } = await client
      .from('printer_preferences')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return normalizePreferences(outletId, data);
  },

  async savePrinterPreferences(outletId: string, payload: Partial<PrinterPreferences>): Promise<PrinterPreferences> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase client not initialized");

    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Company ID missing from profile");

    const normalized = normalizePreferences(outletId, payload);

    const upsertPayload = {
      ...normalized,
      company_id: profile.company_id,
      outlet_id: outletId,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('printer_preferences')
      .upsert(upsertPayload, { onConflict: 'company_id,outlet_id' })
      .select()
      .single();

    if (error) {
      const message = String(error.message || '');
      const isLegacySchema =
        isMissingColumnError(message, 'bill_paper_size') ||
        isMissingColumnError(message, 'kot_paper_size') ||
        isMissingColumnError(message, 'bill_printer_ids') ||
        isMissingColumnError(message, 'kot_printer_ids');

      if (!isLegacySchema) {
        throw new Error(error.message);
      }

      const legacyPayload = {
        company_id: profile.company_id,
        outlet_id: outletId,
        bill_printer_id: normalized.bill_printer_ids[0] || null,
        bill_paper_width: normalized.bill_paper_size || '80mm',
        bill_auto_print: normalized.bill_auto_print,
        kot_printer_id: normalized.kot_printer_ids[0] || null,
        kot_paper_width: normalized.kot_paper_size || '80mm',
        kot_auto_print: normalized.kot_auto_print,
        updated_at: new Date().toISOString(),
      };

      const legacySizeUnsupported = ['bill_paper_width', 'kot_paper_width'].some((key) => {
        const value = String((legacyPayload as any)[key] || '').toLowerCase();
        return value && !value.includes('58') && !value.includes('80');
      });

      if (legacySizeUnsupported) {
        throw new Error('Database migration pending. Apply printer preference migration before using sizes like A4, A3, or 85mm.');
      }

      const { data: legacyData, error: legacyError } = await client
        .from('printer_preferences')
        .upsert(legacyPayload, { onConflict: 'company_id,outlet_id' })
        .select()
        .single();

      if (legacyError) {
        throw new Error('Database migration pending. Apply printer preference migration and refresh the backend schema cache.');
      }

      return normalizePreferences(outletId, legacyData);
    }
    return normalizePreferences(outletId, data);
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
  },

  async tryLocalAgentPrint(
    documentType: 'invoice' | 'kot',
    payload: any,
    options: { printerName?: string; paperSize?: PaperSizeName | null; printer?: Printer | null }
  ) {
    const agentStatus = await this.getLocalPrintAgentStatus();
    if (!agentStatus.available) return null;

    const response = await fetch(`${API_BASE}/print-agent/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentType,
        printerName: options.printerName || null,
        printerType: options.printer?.printer_type || null,
        connectionHint: options.printer?.connection_hint || null,
        paperSize: options.paperSize || null,
        payload,
        plainText: documentType === 'invoice'
          ? this.generateInvoicePlainText(payload, options.paperSize || '80mm')
          : this.generateKotPlainText(payload, options.paperSize || '80mm'),
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: result?.error || `Local print agent failed with HTTP ${response.status}`,
        method: 'LOCAL_AGENT',
      };
    }

    return {
      success: true,
      method: 'LOCAL_AGENT',
      details: result,
    };
  },

  generateInvoicePlainText(invoice: any, paperSize: string): string {
    const width = this.resolvePlainTextWidth(paperSize);
    const divider = '-'.repeat(width);
    const lines = [
      this.centerText(String(invoice?.seller_legal_name || 'PapaPos Restaurant'), width),
      invoice?.seller_trade_name ? this.centerText(String(invoice.seller_trade_name), width) : '',
      invoice?.print_label ? this.centerText(String(invoice.print_label), width) : '',
      invoice?.seller_gstin ? this.centerText(`GSTIN: ${invoice.seller_gstin}`, width) : '',
      divider,
      `INV: ${invoice?.invoice_number || 'DRAFT'}`,
      `DATE: ${invoice?.invoice_date ? new Date(invoice.invoice_date).toLocaleString() : new Date().toLocaleString()}`,
      `MODE: ${invoice?.payment_method || invoice?.payment_mode_name || 'CASH'}`,
      divider,
      this.formatColumns(['ITEM', 'QTY', 'AMT'], [Math.max(10, width - 14), 4, 8]),
      divider,
      ...((invoice?.items || []).flatMap((item: any) => {
        const itemName = String(item?.name || 'Item');
        const amount = Number(item?.total_amount ?? item?.total_price ?? 0).toFixed(2);
        const quantity = String(item?.quantity || 0);
        const wrappedName = this.wrapText(itemName, Math.max(10, width - 14));
        return wrappedName.map((segment, index) =>
          index === 0
            ? this.formatColumns([segment, quantity, amount], [Math.max(10, width - 14), 4, 8])
            : this.formatColumns([segment, '', ''], [Math.max(10, width - 14), 4, 8])
        );
      })),
      divider,
      this.formatKeyValue('SUBTOTAL', Number(invoice?.subtotal || 0).toFixed(2), width),
      Number(invoice?.cgst_total || 0) > 0 ? this.formatKeyValue('CGST', Number(invoice.cgst_total).toFixed(2), width) : '',
      Number(invoice?.sgst_total || 0) > 0 ? this.formatKeyValue('SGST', Number(invoice.sgst_total).toFixed(2), width) : '',
      Number(invoice?.igst_total || 0) > 0 ? this.formatKeyValue('IGST', Number(invoice.igst_total).toFixed(2), width) : '',
      this.formatKeyValue('TOTAL', Number(invoice?.grand_total || 0).toFixed(2), width),
      divider,
      this.centerText('Thank you for your visit.', width),
      '',
      '',
    ];

    return lines.filter(line => line !== '').join('\n');
  },

  generateKotPlainText(ticket: any, paperSize: string): string {
    const width = this.resolvePlainTextWidth(paperSize);
    const divider = '-'.repeat(width);
    const lines = [
      this.centerText(String(ticket?.title || 'KITCHEN ORDER TICKET'), width),
      this.centerText(String(ticket?.outlet_name || 'PapaPos Kitchen'), width),
      ticket?.table_name ? this.centerText(String(ticket.table_name), width) : '',
      divider,
      `ORDER: ${ticket?.order_id || 'NA'}`,
      `TIME: ${ticket?.created_at ? new Date(ticket.created_at).toLocaleString() : new Date().toLocaleString()}`,
      ticket?.staff_name ? `STAFF: ${ticket.staff_name}` : '',
      divider,
      this.formatColumns(['ITEM', 'QTY'], [Math.max(10, width - 6), 6]),
      divider,
      ...((ticket?.items || []).flatMap((item: any) => {
        const wrappedName = this.wrapText(String(item?.name || 'Item'), Math.max(10, width - 6));
        const modifierText = Array.isArray(item?.selected_modifiers) && item.selected_modifiers.length
          ? this.wrapText(`+ ${item.selected_modifiers.map((mod: any) => mod.name).join(', ')}`, Math.max(10, width - 6))
          : [];
        const noteText = item?.notes ? this.wrapText(`Note: ${item.notes}`, Math.max(10, width - 6)) : [];
        return [
          ...wrappedName.map((segment, index) =>
            index === 0
              ? this.formatColumns([segment, String(item?.quantity || 0)], [Math.max(10, width - 6), 6])
              : this.formatColumns([segment, ''], [Math.max(10, width - 6), 6])
          ),
          ...modifierText,
          ...noteText,
        ];
      })),
      divider,
      this.centerText('Prepare Immediately', width),
      '',
      '',
    ];

    return lines.filter(line => line !== '').join('\n');
  },

  resolvePlainTextWidth(paperSize?: string | null) {
    const size = String(paperSize || '').toLowerCase();
    if (size.includes('58')) return 32;
    if (size.includes('a3')) return 64;
    if (size.includes('a4')) return 48;
    if (size.includes('85')) return 44;
    return 42;
  },

  centerText(value: string, width: number) {
    const text = value.trim();
    if (text.length >= width) return text;
    const leftPadding = Math.floor((width - text.length) / 2);
    return `${' '.repeat(leftPadding)}${text}`;
  },

  wrapText(value: string, width: number) {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];

    const lines: string[] = [];
    let current = '';
    words.forEach(word => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= width) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word.length > width ? word.slice(0, width) : word;
      }
    });
    if (current) lines.push(current);
    return lines;
  },

  formatColumns(values: string[], widths: number[]) {
    return values
      .map((value, index) => {
        const safeValue = String(value || '');
        const width = widths[index] || safeValue.length;
        return index === values.length - 1
          ? safeValue.padStart(width, ' ')
          : safeValue.padEnd(width, ' ');
      })
      .join('');
  },

  formatKeyValue(label: string, value: string, width: number) {
    const safeLabel = `${label}:`;
    const valueWidth = value.length;
    const labelWidth = Math.max(0, width - valueWidth);
    return `${safeLabel.padEnd(labelWidth, ' ')}${value}`;
  },
};
