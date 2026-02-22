
import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Shield, MapPin, 
  Search, X, Check, ChevronRight, 
  Loader2, MoreHorizontal, ShieldCheck, Mail, Store,
  AlertTriangle, Power, History, Trash2, Edit3, Globe,
  ShieldAlert, Clock, User as UserIcon, FileText, Send, Link, Copy
} from 'lucide-react';
import { staffService } from '../services/staffService';
import { cloudOutlets } from '../services/supabaseService';
import { auditService } from '../services/auditService';
import { UserRole, StaffStatus, StaffUser, AuditLog, Outlet, StaffHistory } from '../types';

const UserManagement: React.FC = () => {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [view, setView] = useState<'TEAM' | 'AUDIT'>('TEAM');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isResending, setIsResending] = useState<string | null>(null);

  // Compliance Action State
  const [complianceAction, setComplianceAction] = useState<{
    staffId: string;
    type: 'ROLE' | 'STATUS' | 'OUTLET';
    targetValue: any;
    currentValue?: any;
    staffName: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isActionProcessing, setIsActionProcessing] = useState(false);

  // History View State
  const [selectedStaffHistory, setSelectedStaffHistory] = useState<{
    staff: StaffUser;
    logs: StaffHistory[];
  } | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Form States
  const [inviteForm, setInviteForm] = useState({
    email: '',
    full_name: '',
    role: 'CASHIER' as UserRole,
    outlet_ids: [] as string[],
    reason: ''
  });

  useEffect(() => {
    loadData();
  }, [view]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (view === 'TEAM') {
        const [staffData, outletData] = await Promise.all([
          staffService.fetchStaff(),
          cloudOutlets.fetchAll()
        ]);
        setStaff(staffData);
        setOutlets(outletData || []);
      } else {
        const logs = await auditService.fetchLogs();
        setAuditLogs(logs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.outlet_ids.length) return alert("Select at least one outlet.");
    if (!inviteForm.reason) return alert("Reason is mandatory for HR compliance.");
    
    setInviting(true);
    try {
      await staffService.inviteStaff(inviteForm);
      await loadData();
      setIsInviteModalOpen(false);
      setInviteForm({ email: '', full_name: '', role: 'CASHIER', outlet_ids: [], reason: '' });
      alert("Invitation sent and logged in compliance vault.");
    } catch (err: any) {
      alert(`Status: ${err.message}`);
      loadData(); // Reload to see the record even if email failed
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (staffId: string) => {
    setIsResending(staffId);
    try {
      await staffService.resendInvite(staffId);
      alert("Invitation email dispatched.");
    } catch (e: any) {
      alert(`Resend failed: ${e.message}`);
    } finally {
      setIsResending(null);
    }
  };

  const handleCopyLink = async (staffId: string) => {
    try {
      const link = await staffService.getInviteLink(staffId);
      await navigator.clipboard.writeText(link);
      alert("Secure invite link copied to clipboard.");
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openCompliancePrompt = (staffId: string, staffName: string, type: 'ROLE' | 'STATUS' | 'OUTLET', targetValue: any, currentValue?: any) => {
    setComplianceAction({ staffId, staffName, type, targetValue, currentValue });
    setActionReason('');
  };

  const executeComplianceAction = async () => {
    if (!complianceAction || !actionReason) return;
    setIsActionProcessing(true);
    try {
      if (complianceAction.type === 'STATUS') {
        await staffService.toggleStaffStatus(complianceAction.staffId, complianceAction.targetValue, actionReason);
      } else if (complianceAction.type === 'ROLE') {
        await staffService.updateStaffRole(complianceAction.staffId, complianceAction.targetValue, actionReason);
      } else if (complianceAction.type === 'OUTLET') {
        await staffService.updateStaffOutlets(complianceAction.staffId, complianceAction.targetValue, actionReason);
      }
      await loadData();
      setComplianceAction(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsActionProcessing(false);
    }
  };

  const viewStaffHistory = async (staff: StaffUser) => {
    setIsHistoryLoading(true);
    try {
      const history = await staffService.fetchStaffHistory(staff.id);
      setSelectedStaffHistory({ staff, logs: history });
    } catch (e) {
      alert("Failed to load compliance history.");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const filteredStaff = staff.filter(u => 
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 min-h-screen pb-32 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Compliance & Identity</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">HR Lifecycle Traceability Active</p>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={() => setView(view === 'TEAM' ? 'AUDIT' : 'TEAM')}
             className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2"
           >
             {view === 'TEAM' ? <History size={18} /> : <Users size={18} />}
             {view === 'TEAM' ? 'Platform Audit' : 'Team Registry'}
           </button>
           {view === 'TEAM' && (
             <button 
               onClick={() => setIsInviteModalOpen(true)}
               className="flex items-center gap-2 bg-slate-900 text-white px-8 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-all"
             >
                <UserPlus size={20} /> New Enrollment
             </button>
           )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
           <Loader2 className="animate-spin text-orange-500" size={48} />
           <p className="mt-4 font-black text-slate-400 uppercase text-xs">Syncing Identity Cloud...</p>
        </div>
      ) : (
        <>
          {view === 'TEAM' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredStaff.length === 0 ? (
                <div className="col-span-full py-20 bg-white rounded-[40px] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                   <Users size={64} className="opacity-10 mb-4" />
                   <p className="font-black uppercase text-xs tracking-tighter">No staff records found in vault</p>
                </div>
              ) : filteredStaff.map(user => (
                <div key={user.id} className={`bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-2xl transition-all group ${user.status === 'disabled' ? 'grayscale opacity-60' : ''}`}>
                    <div className="p-8 space-y-6">
                      <div className="flex justify-between items-start">
                          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-2xl font-black text-white uppercase shadow-lg ${
                            user.role === 'OWNER' ? 'bg-indigo-600' : 
                            user.role === 'ADMIN' ? 'bg-purple-600' : 
                            'bg-orange-500'
                          }`}>
                            {user.full_name?.charAt(0)}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                                user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                                user.status === 'invited' ? 'bg-blue-100 text-blue-700' : 
                                'bg-rose-100 text-rose-700'
                            }`}>
                                {user.status === 'invited' && !user.is_verified ? 'INVITE_PENDING' : user.status}
                            </span>
                            <select 
                              className="mt-2 px-3 py-1.5 bg-slate-50 border-none rounded-lg text-[10px] font-black uppercase tracking-tight outline-none"
                              value={user.role}
                              onChange={e => openCompliancePrompt(user.id, user.full_name, 'ROLE', e.target.value as UserRole, user.role)}
                            >
                                <option value="OWNER">Owner</option>
                                <option value="ADMIN">Admin</option>
                                <option value="MANAGER">Manager</option>
                                <option value="CASHIER">Cashier</option>
                            </select>
                          </div>
                      </div>

                      <div>
                          <h3 className="text-xl font-black text-slate-900 leading-tight">{user.full_name}</h3>
                          <p className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-1.5">
                            <Mail size={12} /> {user.email}
                          </p>
                      </div>

                      <div className="space-y-4 pt-2">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <span className="flex items-center gap-1.5"><MapPin size={12} /> Outlet Access Scope</span>
                            <button 
                              onClick={() => openCompliancePrompt(user.id, user.full_name, 'OUTLET', user.outlet_ids)}
                              className="text-indigo-600 hover:underline"
                            >Modify</button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {user.outlet_ids.map(oid => (
                                <span key={oid} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase">
                                  {outlets.find(o => o.id === oid)?.name || 'Unknown Site'}
                                </span>
                            ))}
                            {user.outlet_ids.length === 0 && <span className="text-[10px] font-black uppercase text-rose-400">Critical: No Outlet Scope</span>}
                          </div>
                      </div>

                      {user.status === 'invited' && !user.is_verified && (
                        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 space-y-3">
                           <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black uppercase text-amber-600 tracking-widest">Awaiting Onboarding</span>
                              <span className="text-[8px] font-bold text-amber-400 italic">Expires {new Date(user.token_expires_at).toLocaleDateString()}</span>
                           </div>
                           <div className="flex gap-2">
                              <button 
                                onClick={() => handleResendInvite(user.id)}
                                disabled={isResending === user.id}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-white border border-amber-200 text-amber-700 rounded-xl text-[9px] font-black uppercase hover:bg-amber-100 transition-all disabled:opacity-50"
                              >
                                 {isResending === user.id ? <Loader2 className="animate-spin" size={12} /> : <Send size={12} />} Resend
                              </button>
                              <button 
                                onClick={() => handleCopyLink(user.id)}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-white border border-amber-200 text-amber-700 rounded-xl text-[9px] font-black uppercase hover:bg-amber-100 transition-all"
                              >
                                 <Copy size={12} /> Copy Link
                              </button>
                           </div>
                        </div>
                      )}
                    </div>
                    <div className="p-6 bg-slate-50/50 border-t flex justify-between items-center px-8">
                      <button 
                        onClick={() => openCompliancePrompt(user.id, user.full_name, 'STATUS', user.status === 'disabled' ? 'active' : 'disabled', user.status)}
                        className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                          user.status === 'disabled' ? 'text-emerald-600 hover:text-emerald-700' : 'text-rose-600 hover:text-rose-700'
                        }`}
                      >
                          <Power size={14} /> {user.status === 'disabled' ? 'Reactivate' : 'Revoke Access'}
                      </button>
                      <button 
                        onClick={() => viewStaffHistory(user)}
                        className="p-2 text-slate-300 hover:text-indigo-600 transition-all flex items-center gap-2 font-black uppercase text-[10px]"
                      >
                        <History size={14} /> Full Log
                      </button>
                    </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4">
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest">
                       <tr>
                          <th className="px-8 py-5">Actor</th>
                          <th className="px-8 py-5">Action Context</th>
                          <th className="px-8 py-5">Value Shift</th>
                          <th className="px-8 py-5">Timestamp</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {auditLogs.length === 0 ? (
                         <tr><td colSpan={4} className="py-20 text-center text-slate-300 font-black uppercase text-xs">No audit history found</td></tr>
                       ) : auditLogs.map(log => (
                         <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-6">
                               <p className="font-black text-slate-800 text-sm">{(log as any).profiles?.full_name || 'System'}</p>
                               <p className="text-[10px] text-slate-400 font-bold uppercase">ID: {log.actor_user_id.slice(0,8)}</p>
                            </td>
                            <td className="px-8 py-6">
                               <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                  {log.action.replace(/_/g, ' ')}
                               </span>
                            </td>
                            <td className="px-8 py-6">
                               <div className="flex items-center gap-3">
                                  {log.old_value && <span className="text-[10px] font-bold text-slate-400 line-through">{JSON.stringify(log.old_value)}</span>}
                                  {log.old_value && <ChevronRight size={12} className="text-slate-300" />}
                                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{JSON.stringify(log.new_value)}</span>
                               </div>
                            </td>
                            <td className="px-8 py-6">
                               <p className="text-xs font-bold text-slate-500">{new Date(log.timestamp).toLocaleString()}</p>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Compliance Prompt Modal */}
      {complianceAction && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
           <div className="bg-white rounded-[48px] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-8 bg-slate-900 text-white flex flex-col items-center gap-4 text-center">
                 <div className="w-16 h-16 bg-orange-500 rounded-3xl flex items-center justify-center shadow-lg">
                    <ShieldAlert size={32} />
                 </div>
                 <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Legal Change Context</h3>
                    <p className="text-[10px] font-bold opacity-60 uppercase mt-1">Immutable logging required for HR auditability</p>
                 </div>
              </div>
              <div className="p-10 space-y-6">
                 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Personnel</p>
                    <p className="font-black text-slate-800 text-lg">{complianceAction.staffName}</p>
                    <div className="flex items-center gap-2 mt-2">
                       <span className="text-[10px] font-bold text-slate-400 uppercase">Change:</span>
                       <span className="text-[10px] font-black text-indigo-600 uppercase">{complianceAction.type} {complianceAction.currentValue ? `(${complianceAction.currentValue} -> ${complianceAction.targetValue})` : `to ${complianceAction.targetValue}`}</span>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Formal Reason for Change</label>
                    <textarea 
                       required
                       className="w-full p-5 bg-gray-50 border-none rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-indigo-600 outline-none"
                       rows={4}
                       placeholder="Enter detailed reason for disciplinary or operational adjustment..."
                       value={actionReason}
                       onChange={e => setActionReason(e.target.value)}
                    />
                 </div>

                 <div className="flex gap-3">
                    <button 
                       onClick={() => setComplianceAction(null)}
                       className="flex-1 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-xs"
                    >Dismiss</button>
                    <button 
                       disabled={!actionReason || isActionProcessing}
                       onClick={executeComplianceAction}
                       className="flex-[2] py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-30"
                    >
                       {isActionProcessing ? <Loader2 className="animate-spin" size={16} /> : <><Check size={16} /> Confirm & Log Action</>}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Staff History Drawer */}
      {selectedStaffHistory && (
        <div className="fixed inset-0 z-[550] flex items-center justify-end bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl h-screen shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
              <div className="p-8 border-b bg-slate-900 text-white flex justify-between items-center">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-indigo-600 text-white rounded-[20px] flex items-center justify-center text-xl font-black">
                       {selectedStaffHistory.staff.full_name.charAt(0)}
                    </div>
                    <div>
                       <h3 className="text-xl font-black uppercase tracking-tight">{selectedStaffHistory.staff.full_name}</h3>
                       <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Compliance Lifecycle Journal</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedStaffHistory(null)} className="p-3 hover:bg-white/10 rounded-full transition-all">
                    <X size={24} />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-12">
                 {selectedStaffHistory.logs.length === 0 ? (
                   <div className="py-20 text-center opacity-20 space-y-4">
                      <FileText size={64} className="mx-auto" />
                      <p className="font-black uppercase tracking-widest text-xs">No entries found for this lifecycle</p>
                   </div>
                 ) : (
                   <div className="space-y-12 relative before:absolute before:left-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                      {selectedStaffHistory.logs.map((log, idx) => (
                        <div key={log.id} className="relative pl-16 space-y-3 group">
                           <div className="absolute left-4 top-1 w-4 h-4 rounded-full bg-white border-4 border-indigo-500 group-hover:scale-125 transition-transform z-10"></div>
                           <div className="flex items-center justify-between">
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                 {log.event_type.replace('_', ' ')}
                              </span>
                              <div className="flex items-center gap-2 text-slate-300">
                                 <Clock size={12} />
                                 <span className="text-[10px] font-bold">{new Date(log.timestamp).toLocaleString()}</span>
                              </div>
                           </div>
                           <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-sm group-hover:border-indigo-100 transition-all">
                              <div className="flex items-center gap-3 mb-4">
                                 <div className="p-2 bg-white rounded-lg shadow-sm">
                                    {log.event_type === 'STATUS_CHANGE' ? <Power size={14} className="text-orange-500" /> : <Shield size={14} className="text-blue-500" />}
                                 </div>
                                 <p className="font-bold text-slate-600 text-xs">
                                    Changed from <span className="text-slate-400 font-bold">{JSON.stringify(log.old_value) || 'None'}</span> to <span className="text-slate-900 font-black">{JSON.stringify(log.new_value)}</span>
                                 </p>
                              </div>
                              <p className="text-sm font-medium text-slate-700 leading-relaxed italic border-l-4 border-slate-200 pl-4">
                                 "{log.reason}"
                              </p>
                              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                                 <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1.5">
                                    <UserIcon size={10} /> Authorized by: {log.actor_name || 'System Agent'}
                                 </span>
                                 <span className="text-[8px] font-mono text-slate-300">VAULT_HASH: {log.id.slice(0, 8)}</span>
                              </div>
                           </div>
                        </div>
                      ))}
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white rounded-[48px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                 <div className="flex items-center gap-4">
                    <div className="p-4 bg-orange-500 rounded-2xl shadow-lg shadow-orange-900/20">
                       <UserPlus size={24} className="text-white" />
                    </div>
                    <div>
                       <h3 className="text-2xl font-black tracking-tight">Staff Enrollment</h3>
                       <p className="text-[10px] font-black uppercase opacity-60">Compliance Verified Identity Creation</p>
                    </div>
                 </div>
                 <button onClick={() => setIsInviteModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={24} /></button>
              </div>

              <form onSubmit={handleInvite} className="flex-1 overflow-y-auto p-10 space-y-8">
                 <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Legal Name</label>
                          <input 
                            required
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500" 
                            placeholder="John Doe"
                            value={inviteForm.full_name}
                            onChange={e => setInviteForm({...inviteForm, full_name: e.target.value})}
                          />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Work Identity (Email)</label>
                          <input 
                            required type="email"
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500" 
                            placeholder="staff@restaurant.com"
                            value={inviteForm.email}
                            onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                          />
                       </div>
                    </div>

                    <div className="space-y-4">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Initial Security Role (RBAC)</label>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF'].map(r => (
                             <button 
                               key={r} type="button"
                               onClick={() => setInviteForm({...inviteForm, role: r as UserRole})}
                               className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                                 inviteForm.role === r ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100'
                               }`}
                             >
                                {r.replace('_', ' ')}
                             </button>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-4">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hiring / Creation Reason</label>
                       <textarea 
                         required
                         className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500" 
                         rows={3}
                         placeholder="Brief justification for onboarding (e.g., Replacement for X, New Branch Launch)..."
                         value={inviteForm.reason}
                         onChange={e => setInviteForm({...inviteForm, reason: e.target.value})}
                       />
                    </div>

                    <div className="space-y-4">
                       <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Initial Outlet Assignments</label>
                          <button 
                            type="button"
                            onClick={() => setInviteForm({...inviteForm, outlet_ids: outlets.map(o => o.id)})}
                            className="text-[9px] font-black uppercase text-indigo-600 underline"
                          >
                             Grant All Sites
                          </button>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {outlets.map(o => (
                             <label key={o.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                               inviteForm.outlet_ids.includes(o.id) ? 'bg-orange-50 border-orange-500' : 'bg-slate-50 border-transparent'
                             }`}>
                                <div className="flex items-center gap-3">
                                   <Store size={16} className={inviteForm.outlet_ids.includes(o.id) ? 'text-orange-500' : 'text-slate-400'} />
                                   <span className="font-bold text-xs text-slate-700">{o.name}</span>
                                </div>
                                <input 
                                  type="checkbox" className="hidden"
                                  checked={inviteForm.outlet_ids.includes(o.id)}
                                  onChange={e => {
                                    const checked = e.target.checked;
                                    setInviteForm(prev => ({
                                      ...prev,
                                      outlet_ids: checked ? [...prev.outlet_ids, o.id] : prev.outlet_ids.filter(id => id !== o.id)
                                    }));
                                  }}
                                />
                                {inviteForm.outlet_ids.includes(o.id) && <Check size={16} className="text-orange-600" />}
                             </label>
                          ))}
                       </div>
                    </div>
                 </div>

                 <button 
                   type="submit"
                   disabled={inviting || !inviteForm.reason}
                   className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                 >
                    {inviting ? <Loader2 className="animate-spin" size={20} /> : <><Shield size={20} /> Transmit compliance record</>}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
