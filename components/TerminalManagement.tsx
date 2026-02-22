
import React, { useState, useEffect } from 'react';
import { 
  Monitor, Smartphone, Tablet, Shield, ShieldAlert, 
  Trash2, Power, CheckCircle2, Clock, MapPin, 
  Loader2, RefreshCw, Smartphone as DeviceIcon,
  ShieldCheck, AlertTriangle, User, Globe, Search
} from 'lucide-react';
import { sessionService } from '../services/sessionService';
import { TerminalStatus } from '../types';

const TerminalManagement: React.FC = () => {
  const [terminals, setTerminals] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'TERMINALS' | 'SESSIONS'>('TERMINALS');

  useEffect(() => {
    loadData();
  }, [view]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === 'TERMINALS') {
        const data = await sessionService.fetchAllTerminals();
        setTerminals(data);
      } else {
        const data = await sessionService.fetchActiveSessions();
        setSessions(data);
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Cloud connection refused.");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: TerminalStatus) => {
    if (!confirm(`Confirm security state change to ${status}?`)) return;
    try {
      await sessionService.updateTerminalStatus(id, status);
      await loadData();
    } catch (e: any) {
      alert(`Policy Update Failed: ${e.message}`);
    }
  };

  const handleRevokeSession = async (id: string) => {
    if (!confirm("Initiate forced cloud logout for this device?")) return;
    try {
      await sessionService.revokeSession(id);
      await loadData();
    } catch (e: any) {
      alert(`Session Termination Failed: ${e.message}`);
    }
  };

  const getDeviceIcon = (ua: string = '') => {
    const lower = ua.toLowerCase();
    if (lower.includes('mobile')) return <Smartphone size={20} />;
    if (lower.includes('tablet')) return <Tablet size={20} />;
    return <Monitor size={20} />;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 p-8 min-h-screen pb-32 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Fleet Governance</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Terminal & Session Orchestration</p>
        </div>
        <div className="flex gap-4 p-1 bg-white rounded-2xl shadow-sm border border-slate-100">
           <button 
             onClick={() => setView('TERMINALS')}
             className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'TERMINALS' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             Hardware Registry
           </button>
           <button 
             onClick={() => setView('SESSIONS')}
             className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'SESSIONS' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             Active Sessions
           </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-center gap-4 text-rose-700">
           <AlertTriangle size={24} />
           <div className="flex-1">
              <p className="font-black uppercase text-[10px] tracking-widest">Fleet Connection Error</p>
              <p className="text-sm font-medium">{error}</p>
           </div>
           <button onClick={loadData} className="px-6 py-2 bg-rose-600 text-white rounded-xl font-black uppercase text-[10px]">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
           <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Monitor size={24} /></div>
           <div><p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Active Fleet</p><h3 className="text-xl font-black text-slate-800">{terminals.filter(t => t.status === 'APPROVED').length} Terminals</h3></div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
           <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><ShieldCheck size={24} /></div>
           <div><p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Live Handshakes</p><h3 className="text-xl font-black text-slate-800">{sessions.length} Users Online</h3></div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
           <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl"><ShieldAlert size={24} /></div>
           <div><p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Blocked Nodes</p><h3 className="text-xl font-black text-slate-800">{terminals.filter(t => t.status === 'REVOKED').length} Denied</h3></div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-300">
           <Loader2 className="animate-spin text-indigo-500" size={48} />
           <p className="text-[10px] font-black uppercase tracking-widest">Scanning Hardware Grid...</p>
        </div>
      ) : (
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4">
           <div className="overflow-x-auto">
             <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest">
                   <tr>
                      <th className="px-8 py-5">{view === 'TERMINALS' ? 'Terminal Identifier' : 'Assigned Personnel'}</th>
                      <th className="px-8 py-5">Origin / Location</th>
                      <th className="px-8 py-5">Cloud Heartbeat</th>
                      <th className="px-8 py-5">Security Clearance</th>
                      <th className="px-8 py-5 text-right">Ops Execution</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {view === 'TERMINALS' ? terminals.map(t => (
                     <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                              <div className={`p-3 rounded-2xl ${t.status === 'APPROVED' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                 {getDeviceIcon(t.device_info?.ua)}
                              </div>
                              <div>
                                 <p className="font-black text-slate-800 text-sm">{t.name || 'Cloud Node'}</p>
                                 <p className="text-[9px] font-mono text-slate-400">{t.id.slice(0, 18)}...</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-xs font-bold text-slate-600 truncate max-w-[150px]">{t.device_info?.ua || 'Direct Browser'}</p>
                           <p className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1.5 mt-1"><MapPin size={10} className="text-orange-500" /> {t.outlets?.name || 'Central Vault'}</p>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-xs font-bold text-slate-500">{new Date(t.last_seen_at).toLocaleString()}</p>
                        </td>
                        <td className="px-8 py-6">
                           <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                             t.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 
                             t.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-700 animate-pulse' : 
                             'bg-rose-100 text-rose-700'
                           }`}>
                              {t.status.replace('_', ' ')}
                           </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                           <div className="flex justify-end gap-2">
                              {t.status !== 'APPROVED' && (
                                <button onClick={() => handleStatusChange(t.id, 'APPROVED')} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Approve">
                                   <CheckCircle2 size={18} />
                                </button>
                              )}
                              {t.status !== 'REVOKED' && (
                                <button onClick={() => handleStatusChange(t.id, 'REVOKED')} className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm" title="Revoke">
                                   <Power size={18} />
                                </button>
                              )}
                           </div>
                        </td>
                     </tr>
                   )) : sessions.map(s => (
                     <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black uppercase shadow-sm">
                                 {s.profiles?.full_name?.charAt(0)}
                              </div>
                              <div>
                                 <p className="font-black text-slate-800 text-sm">{s.profiles?.full_name}</p>
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.profiles?.role}</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-xs font-bold text-slate-600 flex items-center gap-2">
                             <Monitor size={14} className="text-slate-400" /> {s.terminals?.name || 'Browser Terminal'}
                           </p>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-xs font-bold text-slate-500">{new Date(s.last_active_at).toLocaleTimeString()}</p>
                        </td>
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Authorized</span>
                           </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                           <button 
                             onClick={() => handleRevokeSession(s.id)}
                             className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                           >
                             Revoke Cloud Lease
                           </button>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
           </div>
        </div>
      )}
    </div>
  );
};

export default TerminalManagement;
