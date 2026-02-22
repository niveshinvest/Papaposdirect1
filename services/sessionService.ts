
import { getSupabase, authService } from './supabaseService';
import { getDeviceId } from './db';
import { StaffSession, POSIdentifier } from '../types';

export const sessionService = {
  /**
   * Retrieves or generates a persistent stable terminal identifier.
   */
  getTerminalId(): string {
    let tid = localStorage.getItem('papapos_terminal_id');
    if (!tid) {
      const entropy = Math.random().toString(36).substring(2, 10);
      tid = `TRM-${Date.now()}-${entropy}`;
      localStorage.setItem('papapos_terminal_id', tid);
    }
    return tid;
  },

  /**
   * Handshakes with the backend to register/verify terminal and session.
   * POS continuity is guaranteed: Handshake failures or pending states NEVER block the UI.
   */
  async performHandshake(outletId: string): Promise<{ terminal: POSIdentifier; sessionId: string; approvalMode?: string }> {
    const client = getSupabase();
    const profile = await authService.getProfile();
    const terminalId = this.getTerminalId();
    const userAgent = navigator.userAgent;

    // Cache active outlet for audit scope
    localStorage.setItem('papapos_active_outlet_id', outletId);

    // 1. Immediate Recovery: Use cached identity to avoid boot delays
    const cachedSession = localStorage.getItem('papapos_session_id');
    const cachedTerminal = localStorage.getItem('papapos_terminal_status');

    if (!navigator.onLine && cachedSession && cachedTerminal) {
      try {
        return { 
          terminal: JSON.parse(cachedTerminal), 
          sessionId: cachedSession 
        };
      } catch (e) {
        console.warn("Corrupt terminal cache - continuing in discovery mode.");
      }
    }

    if (!profile) throw new Error("AUTH_SESSION_MISSING");

    // 2. Online Handshake (Non-Blocking for POS Ops)
    try {
      const { data, error } = await client.rpc('pos_terminal_handshake', {
        p_terminal_id: terminalId,
        p_user_id: profile.id,
        p_company_id: profile.company_id,
        p_outlet_id: outletId,
        p_device_info: {
          ua: userAgent,
          res: `${window.innerWidth}x${window.innerHeight}`,
          pwa: window.matchMedia('(display-mode: standalone)').matches
        }
      });

      if (error) {
        if (error.message.toLowerCase().includes("revoked")) {
          this.hardReset();
          throw new Error("TERMINAL_REVOKED");
        }
        console.warn("Handshake degraded: Maintaining local session for continuity.");
      } else if (data) {
        localStorage.setItem('papapos_session_id', data.session_id);
        localStorage.setItem('papapos_terminal_status', JSON.stringify(data.terminal));
        localStorage.setItem('papapos_approval_mode', data.approval_mode || 'manual');
        
        if (data.terminal.status === 'APPROVED') {
          localStorage.setItem('papapos_term_blessed', 'true');
        }
        return { terminal: data.terminal, sessionId: data.session_id, approvalMode: data.approval_mode };
      }
    } catch (e: any) {
      if (e.message === "TERMINAL_REVOKED") throw e;
      console.error("Handshake network failure - switching to local-only mode.");
    }

    return {
      terminal: cachedTerminal ? JSON.parse(cachedTerminal) : { terminal_id: terminalId, status: 'PENDING_APPROVAL', name: 'Terminal' },
      sessionId: cachedSession || 'OFFLINE_FALLBACK_SESSION',
      approvalMode: localStorage.getItem('papapos_approval_mode') || 'manual'
    };
  },

  /**
   * Continuous background validation. 
   */
  async validateCurrentSession(): Promise<{ isValid: boolean; terminalStatus: string; message?: string }> {
    const client = getSupabase();
    const sessionId = localStorage.getItem('papapos_session_id');
    const terminalId = this.getTerminalId();
    
    if (!sessionId) return { isValid: true, terminalStatus: 'NONE' };
    if (!navigator.onLine) return { isValid: true, terminalStatus: 'OFFLINE_AUTHORIZED' };

    try {
      const { data, error } = await client
        .from('staff_sessions')
        .select('status, terminal_id, terminals(status, name)')
        .eq('id', sessionId)
        .maybeSingle();

      if (error || !data) return { isValid: true, terminalStatus: 'LOCAL_TRUST' };

      const terminal: any = Array.isArray(data.terminals) ? data.terminals[0] : data.terminals;

      if (data.status === 'revoked' || terminal?.status === 'REVOKED') {
        localStorage.removeItem('papapos_term_blessed');
        return { isValid: false, terminalStatus: 'REVOKED', message: "Access revoked by administrator." };
      }

      if (data.terminal_id !== terminalId) {
        await this.rebindHardware(sessionId, terminalId);
      }

      return { 
        isValid: true, 
        terminalStatus: terminal?.status || 'PENDING_APPROVAL' 
      };
    } catch (e) {
      return { isValid: true, terminalStatus: 'SYNC_STALLED' };
    }
  },

  async rebindHardware(sessionId: string, newTerminalId: string) {
    const client = getSupabase();
    try {
      await client
        .from('staff_sessions')
        .update({ terminal_id: newTerminalId, last_active_at: new Date().toISOString() })
        .eq('id', sessionId);
    } catch (e) {}
  },

  hardReset() {
    localStorage.removeItem('papapos_session_id');
    localStorage.removeItem('papapos_terminal_status');
    localStorage.removeItem('papapos_term_blessed');
    localStorage.removeItem('papapos_staff_last_active');
    localStorage.removeItem('papapos_approval_mode');
  },

  async fetchActiveSessions() {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return [];
    const { data, error } = await client
      .from('staff_sessions')
      .select('*, profiles!user_id(full_name), terminals(name, status)')
      .eq('company_id', profile.company_id)
      .eq('status', 'active')
      .order('last_active_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async revokeSession(sessionId: string) {
    const client = getSupabase();
    const { error } = await client.from('staff_sessions').update({ status: 'revoked' }).eq('id', sessionId);
    if (error) throw new Error(error.message);
  },

  async fetchAllTerminals() {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return [];
    const { data, error } = await client
      .from('terminals')
      .select('*, outlets(name)')
      .eq('company_id', profile.company_id)
      .order('last_seen_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async updateTerminalStatus(id: string, status: string, name?: string) {
    const client = getSupabase();
    const updates: any = { status, updated_at: new Date().toISOString() };
    if (name) updates.name = name;
    const { error } = await client.from('terminals').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  }
};
