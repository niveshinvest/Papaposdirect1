
import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, Flame, UtensilsCrossed, AlertCircle, ShoppingBag, Loader2, MonitorPlay } from 'lucide-react';
import { kitchenService } from '../services/kitchenService';

interface KDSProps {
  activeOutletId?: string | null;
}

const KDS: React.FC<KDSProps> = ({ activeOutletId }) => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  useEffect(() => {
    if (activeOutletId) {
      loadTickets();
      const interval = setInterval(loadTickets, 10000); // Polling for new prep tickets
      return () => clearInterval(interval);
    }
  }, [activeOutletId]);

  const loadTickets = async () => {
    if (!activeOutletId) return;
    try {
      const data = await kitchenService.fetchActiveTickets(activeOutletId);
      setTickets(data);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error("KDS Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (ticket: any, nextStatus: string) => {
    try {
      await kitchenService.updateTicketStatus(ticket.id, ticket.status, nextStatus);
      await loadTickets();
    } catch (e) {
      alert("Failed to update kitchen status.");
    }
  };

  const getTimeElapsed = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = Math.floor((now.getTime() - then.getTime()) / 60000);
    return diff;
  };

  if (loading && tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white">
        <Loader2 className="animate-spin text-orange-500 mb-4" size={48} />
        <p className="font-black uppercase text-xs tracking-widest">Opening Kitchen Cloud...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 min-h-screen bg-slate-900 text-white pb-32">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
         <div>
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <MonitorPlay size={32} className="text-orange-500" /> KDS Terminal
            </h2>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">Live Preparation Queue • {tickets.length} Active</p>
         </div>
         <div className="flex gap-4">
            <div className="bg-slate-800 border border-slate-700 px-6 py-3 rounded-2xl flex items-center gap-3">
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Auto-refreshing: {lastRefreshed.toLocaleTimeString()}</span>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tickets.map((ticket) => {
          const elapsed = getTimeElapsed(ticket.created_at);
          const isUrgent = elapsed > 15 || ticket.priority === 'URGENT';

          return (
            <div 
              key={ticket.id} 
              className={`flex flex-col rounded-[40px] border-2 transition-all overflow-hidden ${
                isUrgent ? 'border-red-500/50 bg-red-900/10 shadow-[0_0_30px_rgba(239,68,68,0.1)]' : 'border-slate-800 bg-slate-800/40'
              }`}
            >
              <div className={`p-6 flex justify-between items-center ${isUrgent ? 'bg-red-500/20' : 'bg-slate-800/60'}`}>
                 <div className="flex items-center gap-3">
                    <span className="font-black text-xl">#{ticket.order_id.split('-').pop()}</span>
                    <span className="px-3 py-1 bg-slate-700/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-200">
                       {ticket.table_name}
                    </span>
                 </div>
                 <div className={`flex items-center gap-1 font-black text-sm ${isUrgent ? 'text-red-400 animate-pulse' : 'text-orange-500'}`}>
                    <Clock size={16} /> {elapsed}m
                 </div>
              </div>

              <div className="flex-1 p-8 space-y-6">
                 <div className="space-y-4">
                    {ticket.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between items-start gap-4 border-b border-white/5 pb-4 last:border-0">
                         <div className="flex items-center gap-4">
                            <span className="w-10 h-10 bg-slate-700/50 rounded-2xl flex items-center justify-center font-black text-lg border border-white/5">
                               {item.quantity}
                            </span>
                            <div>
                               <p className="font-black text-lg text-slate-100">{item.name}</p>
                               {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                                 <div className="flex flex-wrap gap-2 mt-1">
                                   {item.selected_modifiers.map((mod: any, mi: number) => (
                                     <span key={mi} className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-md text-[10px] font-black uppercase tracking-widest border border-orange-500/30">
                                       {mod.name}
                                     </span>
                                   ))}
                                 </div>
                               )}
                               {item.notes && <p className="text-xs text-orange-400 font-bold italic mt-1">Note: {item.notes}</p>}
                            </div>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="p-6 bg-slate-900/50 flex gap-3">
                 {ticket.status === 'PENDING' && (
                   <button 
                    onClick={() => handleStatusUpdate(ticket, 'PREPARING')}
                    className="flex-1 py-4 bg-orange-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                   >
                     <Flame size={18} /> Fire Prep
                   </button>
                 )}
                 {ticket.status === 'PREPARING' && (
                   <button 
                    onClick={() => handleStatusUpdate(ticket, 'READY')}
                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                   >
                     <UtensilsCrossed size={18} /> Call Station
                   </button>
                 )}
                 {ticket.status === 'READY' && (
                   <button 
                    onClick={() => handleStatusUpdate(ticket, 'SERVED')}
                    className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                   >
                     <CheckCircle2 size={18} /> Clear Ticket
                   </button>
                 )}
              </div>
            </div>
          );
        })}

        {tickets.length === 0 && (
          <div className="col-span-full h-96 flex flex-col items-center justify-center text-slate-600 space-y-6 border-4 border-dashed border-slate-800/50 rounded-[60px]">
             <div className="w-24 h-24 bg-slate-800 rounded-[40px] flex items-center justify-center">
                <ShoppingBag size={48} className="opacity-20" />
             </div>
             <div className="text-center">
                <p className="font-black text-lg uppercase tracking-widest opacity-40">Station Quiet</p>
                <p className="text-xs font-bold mt-1 text-slate-700 uppercase tracking-tighter">Kitchen is caught up with all cloud syncs</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KDS;
