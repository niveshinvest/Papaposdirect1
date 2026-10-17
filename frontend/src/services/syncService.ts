
import { getSupabase, authService } from './supabaseService';
import { db } from './db';
import { StaffUser } from '../types';
import { sessionService } from './sessionService';

(window as any).db = db;

type SyncState = 'ONLINE_APPROVED' | 'OFFLINE_GRACE' | 'BLOCKED';

interface SecurityAuditResult {
  state: SyncState;
  reasonCode?: string;
  source?: 'terminal' | 'staff' | 'outlet' | 'session';
  message?: string;
}

export const syncService = {
  _syncInterval: null as any,
  _isSyncing: false,
  _isInvoiceSyncing: false,
  _gracePeriodMs: 24 * 60 * 60 * 1000, // 24 Hours strict limit

  async start(staff: StaffUser) {
    if (this._syncInterval) return;
    const isOwner = staff.role === 'OWNER';
    console.log(`Sync Engine: Initializing ${isOwner ? 'Owner' : 'Staff'}-aware cycles...`);
    
    this.runSyncCycle(staff);
    this._syncInterval = setInterval(() => this.runSyncCycle(staff), 30000);
  },

  stop() {
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
      this._syncInterval = null;
    }
  },

  async runSyncCycle(staff: StaffUser) {
    if (this._isSyncing) return;
    this._isSyncing = true;

    try {
      const audit = await this.performHardenedSecurityAudit(staff);
      const isOwner = staff.role === 'OWNER';

      if (audit.state === 'BLOCKED') {
        const logPrefix = isOwner ? "[OWNER_BLOCKED]" : "[STAFF_REVOKED]";
        console.error(`${logPrefix} ${audit.reasonCode} (Source: ${audit.source}) - ${audit.message}`);
        
        window.dispatchEvent(new CustomEvent('papapos_forced_logout', { 
          detail: { message: audit.message, isHard: true } 
        }));
        this.stop();
        return;
      }

      if (audit.state === 'OFFLINE_GRACE') {
        console.warn(`[OFFLINE_GRACE] ${audit.reasonCode} - ${audit.message}`);
        if (!navigator.onLine) {
          this._isSyncing = false;
          return;
        }
      } else {
        const roleLabel = isOwner ? 'Owner identity verified' : 'Staff session authorized';
        console.log(`[ONLINE_APPROVED] ${roleLabel} (Source: ${audit.source || 'cloud'})`);
      }

      await this.syncMasterData(staff);
      await this.pushLocalTransactions(staff);
      await this.retrySyncFailures();


    } catch (e) {
      console.error("Sync Engine Cycle Critical Error:", e);
    } finally {
      this._isSyncing = false;
    }
  },

  async getAllowedOutletIds(profileId: string, companyId: string): Promise<string[]> {
    const client = getSupabase();
    const { data, error } = await client
      .from('outlet_users')
      .select('outlet_id')
      .eq('profile_id', profileId);

    if (error) {
      console.warn("Outlet access lookup deferred:", error.message);
      return [];
    }

    return (data || []).map((row: any) => row.outlet_id);
  },

  /**
   * MANDATORY SECURITY AUDIT PROTOCOL
   * RESOLUTION ORDER: 1. Role (Owner/Staff) -> 2. Terminal -> 3. Role-specific Validation
   */
  async performHardenedSecurityAudit(staff: StaffUser): Promise<SecurityAuditResult> {
    const client = getSupabase();
    const isOnline = navigator.onLine;
    const terminalId = sessionService.getTerminalId();
    const isOwner = staff.role === 'OWNER';
    
    // 1. TERMINAL APPROVAL CHECK (Universal Gate)
    if (isOnline) {
      const { data: terminal } = await client.from('terminals').select('status').eq('id', terminalId).maybeSingle();
      if (terminal?.status === 'REVOKED') {
        return { state: 'BLOCKED', reasonCode: 'T_REV', source: 'terminal', message: 'Terminal access revoked by administrator.' };
      }
      if (terminal?.status === 'APPROVED') {
        localStorage.setItem('papapos_term_blessed', 'true');
      }
    } else {
      const previouslyApproved = localStorage.getItem('papapos_term_blessed') === 'true';
      if (!previouslyApproved) {
        return { state: 'BLOCKED', reasonCode: 'T_UNA', source: 'terminal', message: 'Terminal unverified. Initial online sync required.' };
      }
    }

    // 2. OWNER SECURITY BOUNDARY (Bypasses all staff-only logic)
    if (isOwner) {
       if (isOnline) {
          const { data: profile } = await client.from('profiles').select('is_active').eq('id', staff.id).maybeSingle();
          if (profile && !profile.is_active) {
             return { state: 'BLOCKED', reasonCode: 'O_INA', source: 'session', message: 'Owner account blocked or suspended.' };
          }
          // Mark proof of presence
          localStorage.setItem('papapos_staff_last_active', 'true');
          localStorage.setItem('papapos_audit_timestamp', new Date().toISOString());
       } else {
          // Offline Grace for Owner
          const lastAuditStr = localStorage.getItem('papapos_audit_timestamp');
          const lastAudit = lastAuditStr ? new Date(lastAuditStr) : new Date(0);
          if ((Date.now() - lastAudit.getTime()) > this._gracePeriodMs) {
             return { state: 'BLOCKED', reasonCode: 'O_EXP', source: 'session', message: 'Owner security lease expired. Connection required.' };
          }
          return { state: 'OFFLINE_GRACE', reasonCode: 'O_GRC', source: 'session', message: 'Running on cached Owner identity.' };
       }
       return { state: 'ONLINE_APPROVED' };
    }

    // 3. STAFF VALIDATION CHAIN (Gated for operators only)
    if (isOnline) {
      // 3a. Active check via profile registry
      const { data: profileRec } = await client
        .from('profiles')
        .select('is_active')
        .eq('id', staff.id)
        .maybeSingle();

      if (!profileRec) {
        return { state: 'BLOCKED', reasonCode: 'S_MIS', source: 'staff', message: 'User identity record not found in cloud vault.' };
      }
      if (profileRec.is_active === false) {
        return { state: 'BLOCKED', reasonCode: 'S_INA', source: 'staff', message: 'Staff access revoked by management.' };
      }

      // 3b. Outlet scope check
      const activeOutletId = localStorage.getItem('papapos_active_outlet_id');
      const allowedOutletIds = await this.getAllowedOutletIds(staff.id, staff.company_id);
      if (activeOutletId && allowedOutletIds.length > 0 && !allowedOutletIds.includes(activeOutletId)) {
        return { state: 'BLOCKED', reasonCode: 'O_DEN', source: 'outlet', message: 'Unauthorized location scope for this operator.' };
      }
      
      localStorage.setItem('papapos_staff_last_active', 'true');
      localStorage.setItem('papapos_audit_timestamp', new Date().toISOString());
    } else {
      // Staff Offline Grace
      const wasActive = localStorage.getItem('papapos_staff_last_active') === 'true';
      const lastAuditStr = localStorage.getItem('papapos_audit_timestamp');
      const lastAudit = lastAuditStr ? new Date(lastAuditStr) : new Date(0);
      const graceExpired = (Date.now() - lastAudit.getTime()) > this._gracePeriodMs;

      if (!wasActive || graceExpired) {
        return { state: 'BLOCKED', reasonCode: 'S_EXP', source: 'staff', message: 'Operator offline lease expired.' };
      }
      return { state: 'OFFLINE_GRACE', reasonCode: 'N_DWN', source: 'session', message: 'Network lost. Running on cached operator proof.' };
    }

    // 4. SESSION INTEGRITY (Fleet Control)
    const sessionRes = await sessionService.validateCurrentSession();
    if (!sessionRes.isValid && sessionRes.terminalStatus === 'REVOKED') {
       return { state: 'BLOCKED', reasonCode: 'X_INV', source: 'session', message: 'Session revoked via fleet control.' };
    }

    return { state: 'ONLINE_APPROVED' };
  },

  async syncMasterData(staff: StaffUser) {
    if (!navigator.onLine) return;
    const client = getSupabase();
    try {
      // 1. Fetch Categories first to ensure we have context
      const { data: remoteCats } = await client.from('menu_categories').select('*').eq('company_id', staff.company_id);
      if (remoteCats) await db.categories.bulkPut(remoteCats.map((c: any) => ({ ...c, sync_status: 'synced' })));

      // 2. Fetch Menu Items with JOIN to flatten category name for POS filtering logic
      const { data: remoteMenu } = await client
        .from('menu_items')
        .select('*, menu_categories(name)')
        .eq('company_id', staff.company_id);

      if (remoteMenu) {
        await db.menu.bulkPut(remoteMenu.map((m: any) => ({ 
          ...m, 
          category: m.menu_categories?.name || 'Uncategorized',
          sync_status: 'synced' 
        })));
      }

      // 3. Sync Floor Tables
      const { data: remoteTables } = await client.from('tables').select('*').eq('company_id', staff.company_id);
      if (remoteTables) await db.floor_tables.bulkPut(remoteTables.map((t: any) => ({ ...t, sync_status: 'synced' })));

    } catch (e) {
      console.warn("Master data sync deferred:", e);
    }
  },

  _num(...values: any[]) {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  },

  _buildInvoicePayload(invoice: any, invoiceItems: any[], userId: string | null) {
    const { printed, printer_id, items, taxBreakup, ...canonicalInvoice } = invoice as any;
    const mappedItems = (invoiceItems || []).map((it: any) => ({
      id: it.id,
      menu_item_id: it.menu_item_id,
      quantity: this._num(it.quantity),
      taxable_value: this._num(it.taxable_value),
      cgst_amount: this._num(it.cgst_amount),
      sgst_amount: this._num(it.sgst_amount),
      igst_amount: this._num(it.igst_amount),
      total_amount: this._num(it.total_amount, it.taxable_value)
    }));

    const itemTaxable = mappedItems.reduce((sum, item) => sum + item.taxable_value, 0);
    const itemTax = mappedItems.reduce((sum, item) => sum + item.cgst_amount + item.sgst_amount + item.igst_amount, 0);
    const taxableValue = this._num(canonicalInvoice.taxable_value, canonicalInvoice.subtotal, itemTaxable);
    const totalTax = this._num(canonicalInvoice.total_tax, itemTax);
    const grandTotal = this._num(canonicalInvoice.grand_total, canonicalInvoice.total_amount, taxableValue + totalTax);

    return {
      invoice: {
        ...canonicalInvoice,
        taxable_value: taxableValue,
        subtotal: this._num(canonicalInvoice.subtotal, taxableValue),
        total_tax: totalTax,
        grand_total: grandTotal,
        total_amount: this._num(canonicalInvoice.total_amount, grandTotal),
        cgst_amount: this._num(canonicalInvoice.cgst_amount, canonicalInvoice.cgst_total),
        sgst_amount: this._num(canonicalInvoice.sgst_amount, canonicalInvoice.sgst_total),
        igst_amount: this._num(canonicalInvoice.igst_amount, canonicalInvoice.igst_total),
        cgst_total: this._num(canonicalInvoice.cgst_total, canonicalInvoice.cgst_amount),
        sgst_total: this._num(canonicalInvoice.sgst_total, canonicalInvoice.sgst_amount),
        igst_total: this._num(canonicalInvoice.igst_total, canonicalInvoice.igst_amount),
      },
      items: mappedItems,
      user_id: userId,
    };
  },

  async _markInvoiceAndItemsSynced(invoiceId: string, invoiceItems: any[]) {
    await db.invoices.update(invoiceId, { sync_status: 'synced' });
    for (const it of invoiceItems) {
      await db.invoice_items.update(it.id, { sync_status: 'synced' });
    }
  },

  async pushLocalTransactions(staff: StaffUser) {
    if (!navigator.onLine) return;
    const client = getSupabase();
    try {
      const allowedOutletIds = staff.role === 'OWNER'
        ? []
        : await this.getAllowedOutletIds(staff.id, staff.company_id);

      const pendingOrders = await db.orders.where('sync_status').equals('pending').toArray();
      for (const order of pendingOrders) {
        if (staff.role !== 'OWNER' && allowedOutletIds.length > 0 && !allowedOutletIds.includes(order.outlet_id)) continue;
        const { error } = await client.from('orders').upsert({ ...order, sync_status: 'synced' });
        if (!error) await db.orders.update(order.id, { sync_status: 'synced' });
      }

      const pendingInvoices = await db.invoices.where('sync_status').equals('pending').toArray();
      for (const invoice of pendingInvoices) {
        if (staff.role !== 'OWNER' && allowedOutletIds.length > 0 && !allowedOutletIds.includes(invoice.outlet_id)) continue;

       const invoiceItems = await db.invoice_items.where('invoice_id').equals(invoice.id).toArray();
        const payload = this._buildInvoicePayload(invoice, invoiceItems, staff.id);

        try {
          const { error } = await client.rpc('create_invoice_with_inventory', { p_payload: payload }) as any;
          if (error) {
            await this._recordSyncFailure({ company_id: invoice.company_id, outlet_id: invoice.outlet_id, table_name: 'invoices', payload: payload, error });
            continue;
          }

          await this._markInvoiceAndItemsSynced(invoice.id, invoiceItems);
        } catch (e) {
          await this._recordSyncFailure({ company_id: invoice.company_id, outlet_id: invoice.outlet_id, table_name: 'invoices', payload: payload, error: e });
          continue;
        }
      }
      const pendingInvoiceItems = await db.invoice_items.where('sync_status').equals('pending').toArray();

      for (const item of pendingInvoiceItems) {
        const parent = await db.invoices.get(item.invoice_id);
        if (parent?.sync_status === 'synced') {
          await db.invoice_items.update(item.id, { sync_status: 'synced' });
        }
      }

    } catch (e) {
      console.warn("Transaction push deferred.");
    }
  },

  async _recordSyncFailure(params: {
    company_id: string;
    outlet_id: string;
    table_name: 'invoices' | 'invoice_items' | 'payments' | string;
    payload: any;
    error?: unknown;
    device_id?: string;
  }) {
    if (!navigator.onLine) return;
    try {
      const client = getSupabase();
      const errorText =
        typeof params.error === 'string'
          ? params.error
          : (params.error as any)?.message || JSON.stringify(params.error ?? null);

      const { error } = await client.from('sync_failures').insert({
        company_id: params.company_id,
        outlet_id: params.outlet_id,
        table_name: params.table_name,
        payload: params.payload,
        error: errorText,
        device_id: params.device_id,
        status: 'pending',
        synced: false,
      });

      if (error) {
        console.warn('[SYNC_FAILURE_LOG] Failed to write sync_failures row:', error.message);
      }
    } catch (e) {
      console.warn('[SYNC_FAILURE_LOG] Unexpected error:', e);
    }
  },


async retrySyncFailures() {
  if (!navigator.onLine) return;

  try {
    const client = getSupabase();

    const { data: failures, error } = await client
      .from("sync_failures")
      .select("*")
      .eq("synced", false)
      .lt("retry_count", 10)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error || !failures || failures.length === 0) return;

    for (const failure of failures) {
      try {
        const { id, table_name, payload, retry_count } = failure;

        let retryResult: any;
        if (table_name === 'invoices' && payload?.invoice && Array.isArray(payload?.items)) {
          retryResult = await client.rpc('create_invoice_with_inventory', { p_payload: payload }) as any;
        } else if (table_name === 'invoice_items') {
          const itemPayload = Array.isArray(payload) ? payload[0] : payload;
          const parentInvoiceId = itemPayload?.invoice_id;
          const parent = parentInvoiceId ? await db.invoices.get(parentInvoiceId) : null;
          if (parent) {
            const invoiceItems = await db.invoice_items.where('invoice_id').equals(parentInvoiceId).toArray();
            retryResult = await client.rpc('create_invoice_with_inventory', {
              p_payload: this._buildInvoicePayload(parent, invoiceItems, null)
            }) as any;
          } else {
            retryResult = { error: new Error('Cannot retry invoice item without its parent invoice payload') };
          }
        } else {
          retryResult = await client.from(table_name).upsert(payload);
        }

        const retryError = retryResult.error;

        if (retryError) {
          await client
            .from("sync_failures")
            .update({
              retry_count: (retry_count || 0) + 1
            })
            .eq("id", id);

          console.warn("🔁 Retry failed:", table_name, retryError.message);
          continue;
        }

        await client
          .from("sync_failures")
          .update({
            synced: true,
            status: "synced"
          })
          .eq("id", id);

        console.log("✅ Sync failure recovered:", table_name, id);

      } catch (err) {
        console.warn("Retry unexpected error:", err);
      }
    }

  } catch (e) {
    console.warn("retrySyncFailures deferred:", e);
  }
},



  async syncPendingInvoices(ctx: {
    company_id: string;
    outlet_id: string;
    device_id?: string;
  }) {
    if (!navigator.onLine) return;
    if (this._isInvoiceSyncing) return;
    this._isInvoiceSyncing = true;

    try {
      const client = getSupabase();

      const pendingInvoices = await db.invoices.where('sync_status').equals('pending').toArray();
      const scopedInvoices = pendingInvoices.filter((inv: any) => inv.company_id === ctx.company_id && inv.outlet_id === ctx.outlet_id);

      for (const invoice of scopedInvoices) {
        try {
          const invoiceItems = await db.invoice_items.where('invoice_id').equals(invoice.id).toArray();
          const payload = this._buildInvoicePayload(invoice, invoiceItems, null);

          const { error } = await client.rpc('create_invoice_with_inventory', { p_payload: payload }) as any;
          if (error) {
            await this._recordSyncFailure({ company_id: invoice.company_id, outlet_id: invoice.outlet_id, table_name: 'invoices', payload, error, device_id: ctx.device_id });
            continue;
          }

          await this._markInvoiceAndItemsSynced(invoice.id, invoiceItems);
        } catch (e) {
          await this._recordSyncFailure({ company_id: invoice.company_id, outlet_id: invoice.outlet_id, table_name: 'invoices', payload: invoice, error: e, device_id: ctx.device_id });
        }
      }
    } catch (e) {
      console.warn('[SYNC_PENDING_INVOICES] Deferred:', e);
    } finally {
      this._isInvoiceSyncing = false;
    }
  }
};
