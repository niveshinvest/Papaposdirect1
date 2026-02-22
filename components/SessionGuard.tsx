
import React, { useState, useEffect } from 'react';
import { ShieldAlert, LogOut, Loader2, Info, X, Terminal, WifiOff, CheckCircle2 } from 'lucide-react';
import { sessionService } from '../services/sessionService';

const SessionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hardBlock, setHardBlock] = useState<{ message: string } | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<string>('APPROVED');
  const [approvalMode, setApprovalMode] = useState<string>('manual');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showWarning, setShowWarning] = useState(true);

  useEffect(() => {
    const checkSecurity = async () => {
      try {
        const res = await sessionService.validateCurrentSession();
        setTerminalStatus(res.terminalStatus);
        
        const mode = localStorage.getItem('papapos_approval_mode') || 'manual';
        setApprovalMode(mode);

        // ONLY revoked terminals/sessions trigger a hard UI block.
        if (!res.isValid && res.terminalStatus === 'REVOKED') {
          setHardBlock({ message: res.message || "Terminal Access Revoked" });
        } else {
          setHardBlock(null);
        }
      } catch (e) {
        console.warn("Security heartbeat failed - Maintaining POS continuity.");
      }
    };

    const interval = setInterval(checkSecurity, 60000);
    checkSecurity();

    const handleStatusChange = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  const handleClearAndExit = () => {
    sessionService.hardReset();
    window.location.href = '/'; 
  };

  // 1. HARD BLOCK: Only for explicit Admin REVOKED state.
  if (hardBlock) {
    return (
      <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-900/98 backdrop-blur-3xl p-6">
        <div className="bg-white rounded-[56px] w-full max-w-lg p-12 text-center space-y-8 shadow-2xl border-8 border-rose-500/20 animate-in zoom-in duration-300">
          <div className="w-24 h-24 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
             <ShieldAlert size={48} className="animate-pulse" />
          </div>
          <div className="space-y-3">
             <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Terminal Disabled</h2>
             <p className="text-slate-500 font-medium leading-relaxed">{hardBlock.message}</p>
             <div className="px-5 py-2.5 bg-slate-50 rounded-2xl inline-block border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TID: {sessionService.getTerminalId()}</p>
             </div>
          </div>
          <button 
            onClick={handleClearAndExit}
            className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95"
          >
             <LogOut size={20} /> Sign Out
          </button>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight opacity-60">Contact your administrator to re-enable this device.</p>
        </div>
      </div>
    );
  }

  // 2. POS CORE UI
  return (
    <>
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-xl px-4 flex flex-col gap-2 pointer-events-none">
        {/* Offline Protection Indicator */}
        {isOffline && (
          <div className="bg-slate-900/90 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center justify-between border border-white/10 backdrop-blur-md pointer-events-auto">
             <div className="flex items-center gap-3">
                <WifiOff size={16} className="text-orange-500" />
                <p className="text-[10px] font-black uppercase tracking-widest">Local Mode Active: Orders will sync when online</p>
             </div>
          </div>
        )}

        {/* Success Banner: Auto-Approved First Terminal */}
        {showWarning && approvalMode === 'auto' && terminalStatus === 'APPROVED' && (
          <div className="bg-emerald-600 text-white p-4 rounded-[28px] shadow-2xl flex items-center justify-between gap-4 pointer-events-auto border border-emerald-500/20 animate-in slide-in-from-top duration-500">
            <div className="flex items-center gap-4">
               <div className="p-2 bg-white/20 rounded-xl">
                  <CheckCircle2 size={18} />
               </div>
               <div>
                  <p className="text-[11px] font-black uppercase tracking-widest leading-none">Primary POS device approved</p>
                  <p className="text-[9px] font-bold opacity-80 uppercase mt-1">Automatic system verification successful • Full security active</p>
               </div>
            </div>
            <button onClick={() => { setShowWarning(false); localStorage.setItem('papapos_approval_mode', 'manual'); }} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
               <X size={16} />
            </button>
          </div>
        )}

        {/* Soft Warning: Terminal Pending Review */}
        {showWarning && approvalMode === 'manual' && (terminalStatus === 'PENDING_APPROVAL' || terminalStatus === 'SUSPENDED' || terminalStatus === 'LOCAL_TRUST') && (
          <div className={`bg-amber-600 text-white p-4 rounded-[28px] shadow-2xl flex items-center justify-between gap-4 pointer-events-auto border border-amber-500/20 animate-in slide-in-from-top duration-500`}>
            <div className="flex items-center gap-4">
               <div className="p-2 bg-white/20 rounded-xl">
                  <Terminal size={18} />
               </div>
               <div>
                  <p className="text-[11px] font-black uppercase tracking-widest leading-none">New device detected</p>
                  <p className="text-[9px] font-bold opacity-80 uppercase mt-1">Admin approval required • Operations active under temporary lease</p>
               </div>
            </div>
            <button onClick={() => setShowWarning(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
               <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* POS Content is always usable */}
      <div className="min-h-screen">
        {children}
      </div>
    </>
  );
};

export default SessionGuard;
