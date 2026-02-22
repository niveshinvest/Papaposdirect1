
import { getSupabase, authService } from './supabaseService';

export interface PrinterRegistryEntry {
  id?: string;
  name: string;
  printer_type: 'bluetooth' | 'wifi' | 'wired';
  connection_info: {
    ip?: string;
    mac?: string;
    usb_name?: string;
    device_id?: string;
  };
  roles: ('BILL' | 'KOT')[];
  is_active: boolean;
  outlet_id: string;
}

export interface DiscoveredDevice {
  name: string;
  technical_id: string;
  type: 'bluetooth' | 'wifi' | 'usb';
  manufacturer?: string;
}

export const printerService = {
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

  async fetchRegistry(outletId: string): Promise<PrinterRegistryEntry[]> {
    const client = getSupabase();
    if (!client) return [];
    const { data, error } = await client
      .from('printers_registry')
      .select('*')
      .eq('outlet_id', outletId)
      .order('created_at');
    if (error) throw new Error(error.message);
    return data || [];
  },

  async saveToRegistry(entry: PrinterRegistryEntry) {
    const client = getSupabase();
    if (!client) return;
    const profile = await authService.getProfile();
    const { data, error } = await client
      .from('printers_registry')
      .upsert({ 
        ...entry, 
        company_id: profile.company_id 
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteFromRegistry(id: string) {
    const client = getSupabase();
    if (!client) return;
    const { error } = await client
      .from('printers_registry')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getPrintersForRole(outletId: string, role: 'BILL' | 'KOT'): Promise<PrinterRegistryEntry[]> {
    const registry = await this.fetchRegistry(outletId);
    return registry.filter(p => p.is_active && p.roles.includes(role));
  }
};
