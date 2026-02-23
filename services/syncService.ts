
import { getSupabase, authService } from './supabaseService';
import { db } from './db';
import { StaffUser } from '../types';
import { sessionService } from './sessionService';

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

    } catch (e) {
      console.error("Sync Engine Cycle Critical Error:", e);
    } finally {
      this._isSyncing = false;
    }
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
      // 3a. Active check via staff registry
      const { data: staffRec } = await client.from('staff_users').select('status, outlet_ids').eq('id', staff.id).maybeSingle();
      
      if (!staffRec) {
        return { state: 'BLOCKED', reasonCode: 'S_MIS', source: 'staff', message: 'Staff identity record not found in cloud vault.' };
      }
      if (staffRec.status === 'disabled') {
        return { state: 'BLOCKED', reasonCode: 'S_INA', source: 'staff', message: 'Staff access revoked by management.' };
      }

      // 3b. Outlet scope check
      const activeOutletId = localStorage.getItem('papapos_active_outlet_id');
      if (activeOutletId && !staffRec.outlet_ids.includes(activeOutletId)) {
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

  async pushLocalTransactions(staff: StaffUser) {
    if (!navigator.onLine) return;
    const client = getSupabase();
    try {
      const pendingOrders = await db.orders.where('sync_status').equals('pending').toArray();
      for (const order of pendingOrders) {
        if (staff.role !== 'OWNER' && staff.outlet_ids && !staff.outlet_ids.includes(order.outlet_id)) continue;
        const { error } = await client.from('orders').upsert({ ...order, sync_status: 'synced' });
        if (!error) await db.orders.update(order.id, { sync_status: 'synced' });
      }

      const pendingInvoices = await db.invoices.where('sync_status').equals('pending').toArray();
      for (const invoice of pendingInvoices) {
        if (staff.role !== 'OWNER' && staff.outlet_ids && !staff.outlet_ids.includes(invoice.outlet_id)) continue;
        const { error } = await client.from('invoices').upsert({ ...invoice, sync_status: 'synced' });
        if (!error) await db.invoices.update(invoice.id, { sync_status: 'synced' });
      }

      const pendingInvoiceItems = await db.invoice_items.where('sync_status').equals('pending').toArray();
      for (const item of pendingInvoiceItems) {
        const { error } = await client.from('invoice_items').upsert({ ...item, sync_status: 'synced' });
        if (!error) await db.invoice_items.update(item.id, { sync_status: 'synced' });
      }
    } catch (e) {
      console.warn("Transaction push deferred.");
    }
  }
};
