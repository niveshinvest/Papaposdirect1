
import { Dexie } from 'dexie';
import type { Table as DexieTable } from 'dexie';
import { 
  Order, InventoryItem, MenuItem, Recipe, InventoryCategory, 
  PrinterConfig, PurchaseOrder, Outlet, Table, WhatsAppTemplate, 
  WhatsAppLog, GstReport, ReportSnapshot, Invoice, PaymentMethod 
} from '../types';
import { Customer } from '../constants';

export interface SyncConfig {
  id: string;
  url: string;
  key: string;
  lastSyncedAt: Date | null;
  isEnabled: boolean;
}

export interface DeletionLog {
  id: string;
  remoteId: string;
  table: string;
  company_id: string;
  outlet_id: string;
  timestamp: Date;
}

export interface RecycleBinItem {
  id: string;
  type: string;
  data: any;
  deletedAt: Date;
  sync_status: 'synced' | 'pending';
}

/**
 * GENERATES A UNIQUE PERSISTENT DEVICE IDENTIFIER
 */
export const getDeviceId = (): string => {
  let id = localStorage.getItem('papapos_device_id');
  if (!id) {
    const entropy = Math.random().toString(36).substring(2, 15);
    id = `POS-TERM-${Date.now()}-${entropy}`;
    localStorage.setItem('papapos_device_id', id);
  }
  return id;
};

export class PapaPosDatabase extends Dexie {
  orders!: DexieTable<Order>;
  invoices!: DexieTable<Invoice>;
  invoice_items!: DexieTable<any>;
  menu!: DexieTable<MenuItem>;
  inventory!: DexieTable<InventoryItem>;
  recipes!: DexieTable<Recipe>;
  categories!: DexieTable<InventoryCategory>;
  printers!: DexieTable<PrinterConfig>;
  purchase_orders!: DexieTable<PurchaseOrder>;
  customers!: DexieTable<Customer & { sync_status: 'synced' | 'pending', outlet_id: string, company_id: string }>;
  outlets!: DexieTable<Outlet>;
  floor_tables!: DexieTable<Table>;
  payment_methods!: DexieTable<PaymentMethod>;
  whatsapp_templates!: DexieTable<WhatsAppTemplate>;
  whatsapp_logs!: DexieTable<WhatsAppLog>;
  gst_reports!: DexieTable<GstReport>;
  report_snapshots!: DexieTable<ReportSnapshot>;
  config!: DexieTable<SyncConfig>;
  deletions!: DexieTable<DeletionLog>;
  recycle_bin!: DexieTable<RecycleBinItem>;

  constructor() {
    super('PapaPosProDB_v4');
    
    // VERSION 4: Added year/month indexes for GST reports and corrected outlet_id indexing across all tables
    (this as any).version(1).stores({
      orders: 'id, company_id, outlet_id, [company_id+outlet_id], sync_status, status, timestamp',
      invoices: 'id, company_id, outlet_id, [company_id+outlet_id], sync_status, order_id, invoice_number',
      invoice_items: 'id, invoice_id, sync_status',
      menu: 'id, company_id, outlet_id, [company_id+outlet_id], category, sync_status',
      inventory: 'id, company_id, outlet_id, [company_id+outlet_id], sync_status',
      recipes: 'id, company_id, sync_status',
      categories: 'id, company_id, outlet_id, [company_id+outlet_id], sync_status',
      printers: 'id, company_id, outlet_id, [company_id+outlet_id], sync_status',
      purchase_orders: 'id, company_id, outlet_id, [company_id+outlet_id], sync_status',
      customers: 'id, company_id, outlet_id, [company_id+outlet_id], phone, sync_status',
      outlets: 'id, company_id, sync_status',
      floor_tables: 'id, company_id, outlet_id, [company_id+outlet_id], sync_status',
      payment_methods: 'id, company_id, sync_status',
      whatsapp_templates: 'id, company_id, sync_status',
      whatsapp_logs: 'id, company_id, outlet_id, [company_id+outlet_id], sync_status',
      gst_reports: 'id, company_id, outlet_id, [company_id+outlet_id], year, month, sync_status',
      report_snapshots: 'id, company_id, outlet_id, [company_id+outlet_id], date, sync_status',
      config: 'id',
      deletions: 'id, table, company_id',
      recycle_bin: 'id, type, deletedAt, sync_status'
    });
  }

  async createSyncableRecord<T>(table: DexieTable<T>, data: any, ctx: { company_id: string, outlet_id: string, staff_user_id: string }) {
    const record = {
      ...data,
      id: data.id || crypto.randomUUID(),
      company_id: ctx.company_id,
      outlet_id: ctx.outlet_id,
      staff_user_id: ctx.staff_user_id,
      device_id: getDeviceId(),
      created_at: new Date(),
      updated_at: new Date(),
      sync_status: 'pending',
      version: 1
    };
    await (table as any).put(record);
    return record;
  }
}

export const db = new PapaPosDatabase();
