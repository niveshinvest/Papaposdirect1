
import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Settings, ShieldCheck, CheckCircle2, 
  Send, RefreshCw, AlertTriangle, Search, Filter, 
  Eye, History, BarChart3, Clock, User, Phone,
  Zap, ExternalLink, Smartphone, Copy, Loader2, XCircle,
  ShieldAlert, ListFilter
} from 'lucide-react';
import { getSupabase, authService } from '../services/supabaseService';

const WhatsAppIntegration: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getSupabase();
      const profile = await authService.getProfile();
      const { data: company, error: fetchErr } = await client
        .from('companies')
        .select('whatsapp_config')
        .eq('id', profile.company_id)
        .single();
      
      if (fetchErr) throw fetchErr;
      setConfig(company?.whatsapp_config || { is_connected: false });

      // Load Recent Messages
      const { data: msgs } = await client
        .from('whatsapp_messages')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .limit(10);
      setMessages(msgs || []);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load bot registry.");
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = async (key: string, value: boolean) => {
    if (!config.is_connected) return;
    try {
      const client = getSupabase();
      const profile = await authService.getProfile();
      const newMapping = { ...(config.event_mapping || {}), [key]: value };
      const newConfig = { ...config, event_mapping: newMapping };
      
      const { error: updErr } = await client
        .from('companies')
        .update({ whatsapp_config: newConfig })
        .eq('id', profile.company_id);
      
      if (updErr) throw updErr;
      setConfig(newConfig);
    } catch (e) {
      alert("Configuration update failed.");
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
         <Loader2 className="animate-spin text-[#25D366]" size={48} />
         <p className="font-black uppercase tracking-widest text-[10px] mt-4">Pinging Meta Cloud...</p>
      </div>
    );
  }

  const eventMappings = [
    { id: 'bill_settled', label: 'Bill Settlement', desc: 'Auto-send invoice PDF' },
    { id: 'kitchen_ready', label: 'Kitchen Ready', desc: 'Alert customer to pickup' },
    { id: 'payment_received', label: 'Payment Receipt', desc: 'Confirm digital funds' }
  ];

  return (
    <div className="p-8 space-y-8 min-h-screen pb-32 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-[#25D366] mb-1">
             <MessageSquare size={16} />
             <span className="text-[10px] font-black uppercase tracking-widest">WhatsApp Business API Gateway</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Bot Infrastructure</h2>
        </div>
        <div className="flex gap-3">
           <button onClick={loadConfig} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm">
              <RefreshCw size={18} />
           </button>
           <button className="flex items-center gap-2 bg-[#25D366] text-white px-8 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-all uppercase text-xs tracking-widest">
              <Zap size={20} /> Configure API
           </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-center gap-4 text-rose-700 animate-in shake">
           <ShieldAlert size={24} />
           <p className="font-bold text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm space-y-10">
            <div className="flex items-center gap-6">
               <div className={`p-6 rounded-[32px] shadow-lg ${config?.is_connected ? 'bg-[#25D366]/10 text-[#25D366]' : 'bg-rose-50 text-rose-500'}`}>
                  {config?.is_connected ? <CheckCircle2 size={40} /> : <XCircle size={40} />}
               </div>
               <div>
                  <h3 className="text-2xl font-black text-slate-900">{config?.is_connected ? 'Service Active' : 'Service Disconnected'}</h3>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Status Mapping: Verified Cloud Native</p>
               </div>
            </div>

            <div className="space-y-4">
               <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <Phone size={20} className="text-indigo-500" />
                     <p className="font-bold text-slate-700">Business Phone</p>
                  </div>
                  <span className="font-black text-slate-900">{config?.phone_number || 'NOT CONNECTED'}</span>
               </div>
               <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <Zap size={20} className="text-orange-500" />
                     <p className="font-bold text-slate-700">Webhook Status</p>
                  </div>
                  <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${config?.webhook_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                     {config?.webhook_verified ? 'Verified' : 'Unauthorized'}
                  </span>
               </div>
               <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <Clock size={20} className="text-blue-500" />
                     <p className="font-bold text-slate-700">Last Activity</p>
                  </div>
                  <span className="text-xs font-bold text-slate-400">{config?.last_message_at ? new Date(config.last_message_at).toLocaleString() : 'No Traffic Detected'}</span>
               </div>
            </div>
         </div>

         {!config?.is_connected ? (
           <div className="bg-slate-900 p-10 rounded-[48px] text-white flex flex-col items-center justify-center text-center space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5"><Zap size={200} /></div>
              <div className="p-8 bg-white/10 rounded-full border-4 border-white/5 mx-auto w-fit animate-bounce-slow">
                 <ShieldAlert size={64} className="text-orange-500" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-2xl font-black">Meta Identity Handshake Required</h3>
                 <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-sm mx-auto">
                    WhatsApp bot integration requires a valid Meta Business Access Token and Verified WABA ID. Configuration is currently absent in your company profile.
                 </p>
              </div>
              <button className="px-10 py-5 bg-white text-slate-900 rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">Setup API Credentials</button>
           </div>
         ) : (
           <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-8 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 p-8 opacity-10"><Zap size={140} /></div>
              <h4 className="text-xl font-black tracking-tight relative z-10 uppercase">Live Event Mapping</h4>
              <div className="space-y-4 relative z-10">
                 {eventMappings.map((e) => {
                   const isEnabled = config.event_mapping?.[e.id] ?? false;
                   return (
                     <div key={e.id} className="flex justify-between items-center p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-all group">
                        <div>
                           <p className="font-bold">{e.label}</p>
                           <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">{e.desc}</p>
                        </div>
                        <button 
                          onClick={() => updateMapping(e.id, !isEnabled)}
                          className={`w-14 h-7 rounded-full relative transition-all shadow-inner ${isEnabled ? 'bg-[#25D366]' : 'bg-slate-700'}`}
                        >
                           <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${isEnabled ? 'right-1' : 'left-1'}`}></div>
                        </button>
                     </div>
                   );
                 })}
              </div>
              <div className="p-6 bg-white/5 rounded-[32px] border border-white/10 italic">
                 <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                    Note: Automated messages consume Meta Business API credits. Ensure your marketplace payout account is connected to the WhatsApp Gateway.
                 </p>
              </div>
           </div>
         )}
      </div>

      <div className="bg-white rounded-[48px] border border-slate-100 shadow-sm overflow-hidden">
         <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
               <History size={20} className="text-slate-400" />
               <h3 className="font-black text-slate-800 uppercase text-sm tracking-widest">Traffic Ledger</h3>
            </div>
            <span className="px-3 py-1 bg-white border rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">Last 10 Events</span>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                     <th className="px-8 py-5">Timestamp</th>
                     <th className="px-8 py-5">Sender/Recipient</th>
                     <th className="px-8 py-5">Direction</th>
                     <th className="px-8 py-5">Message Body</th>
                     <th className="px-8 py-5">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {messages.length === 0 ? (
                    <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-black uppercase text-xs">No traffic recorded</td></tr>
                  ) : messages.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                       <td className="px-8 py-6 text-xs font-bold text-slate-500">{new Date(m.created_at).toLocaleString()}</td>
                       <td className="px-8 py-6 font-black text-slate-800">{m.direction === 'INBOUND' ? m.sender : m.recipient}</td>
                       <td className="px-8 py-6">
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${m.direction === 'INBOUND' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                             {m.direction}
                          </span>
                       </td>
                       <td className="px-8 py-6 text-xs font-medium text-slate-600 max-w-xs truncate">{m.message_body}</td>
                       <td className="px-8 py-6">
                          <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest">{m.status}</span>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default WhatsAppIntegration;
