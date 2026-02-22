
import React, { useState } from 'react';
import { Organization, Outlet, StockTransfer, InventoryItem } from '../types';
import { Repeat, Plus, Search, Truck, Check, X, ArrowRight, Package, Warehouse, Store, MoreHorizontal, Clock } from 'lucide-react';
// Remove non-existent MOCK_INVENTORY import

interface StockTransfersProps {
  activeOutlet: Outlet | null;
  org: Organization | null;
}

const StockTransfers: React.FC<StockTransfersProps> = ({ activeOutlet, org }) => {
  const [transfers, setTransfers] = useState<StockTransfer[]>([
    {
      id: 'ST-9281',
      fromOutletId: 'OUT-001',
      toOutletId: 'OUT-002',
      items: [{ inventoryItemId: 'inv-1', name: 'Amul Paneer', quantity: 100, unit: 'kg' }],
      status: 'DISPATCHED',
      timestamp: new Date(),
      remarks: 'Weekly restocking'
    }
  ]);

  const [isNewTransferModalOpen, setIsNewTransferModalOpen] = useState(false);
  const [transferType, setTransferType] = useState<'REQUEST' | 'DISPATCH'>('REQUEST');

  return (
    <div className="p-8 space-y-8 min-h-screen pb-20 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Stock Transfers</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Move materials between godown and retail shops.</p>
        </div>
        <div className="flex gap-3">
           <button className="flex items-center gap-2 px-4 py-2 border-2 border-gray-100 bg-white rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all">
             <Clock size={18} /> Transfer Logs
           </button>
           <button 
            onClick={() => setIsNewTransferModalOpen(true)}
            className="flex items-center gap-2 bg-[#FF6B00] text-white px-6 py-2.5 rounded-xl font-black shadow-xl shadow-orange-100 hover:scale-105 transition-all"
           >
            <Plus size={20} /> Create Transfer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-40 group hover:border-orange-200 transition-all">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl w-fit"><Truck size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">In Transit</p>
               <h3 className="text-2xl font-black text-slate-800">03</h3>
            </div>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-40 group hover:border-blue-200 transition-all">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl w-fit"><Repeat size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Requests Pending</p>
               <h3 className="text-2xl font-black text-slate-800">08</h3>
            </div>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-40 group hover:border-green-200 transition-all">
            <div className="p-3 bg-green-100 text-green-600 rounded-2xl w-fit"><Check size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Completed Today</p>
               <h3 className="text-2xl font-black text-slate-800">14</h3>
            </div>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-40 group hover:border-indigo-200 transition-all">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl w-fit"><Warehouse size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Warehouse Health</p>
               <h3 className="text-2xl font-black text-slate-800">98%</h3>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
         <div className="p-6 border-b flex justify-between bg-gray-50/50">
            <div className="relative flex-1 max-w-md">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
               <input type="text" placeholder="Search transfer ID or location..." className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none" />
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                     <th className="px-8 py-5">Transfer ID</th>
                     <th className="px-8 py-5">Route</th>
                     <th className="px-8 py-5">Items</th>
                     <th className="px-8 py-5">Status</th>
                     <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                  {transfers.map(transfer => (
                    <tr key={transfer.id} className="hover:bg-gray-50 transition-colors">
                       <td className="px-8 py-6">
                          <p className="font-black text-slate-800">#{transfer.id}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {new Date(transfer.timestamp).toLocaleDateString()}
                          </p>
                       </td>
                       <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                             <div className="text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase">From</p>
                                <p className="text-xs font-bold text-slate-700">{org?.outlets?.find(o => o.id === transfer.fromOutletId)?.name || 'Unknown'}</p>
                             </div>
                             <ArrowRight size={14} className="text-gray-300" />
                             <div className="text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase">To</p>
                                <p className="text-xs font-bold text-slate-700">{org?.outlets?.find(o => o.id === transfer.toOutletId)?.name || 'Unknown'}</p>
                             </div>
                          </div>
                       </td>
                       <td className="px-8 py-6">
                          <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                                <Package size={16} />
                             </div>
                             <p className="text-sm font-bold text-slate-700">
                                {transfer.items[0].name} {transfer.items.length > 1 ? `+ ${transfer.items.length - 1} more` : ''}
                             </p>
                          </div>
                       </td>
                       <td className="px-8 py-6">
                          <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            transfer.status === 'RECEIVED' ? 'bg-green-100 text-green-700' :
                            transfer.status === 'DISPATCHED' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                             {transfer.status}
                          </span>
                       </td>
                       <td className="px-8 py-6 text-right">
                          <button className="p-2 text-slate-300 hover:text-slate-900 transition-colors">
                             <MoreHorizontal size={20} />
                          </button>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {isNewTransferModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[48px] w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-black tracking-tight">Initiate Stock Transfer</h3>
                    <p className="text-xs font-bold opacity-50 uppercase tracking-widest mt-1">Inter-Store Logistics</p>
                 </div>
                 <button onClick={() => setIsNewTransferModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-all">
                    <X size={24} />
                 </button>
              </div>

              <div className="p-10 space-y-8">
                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Source (From)</label>
                       <select className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-orange-500">
                          {org?.outlets?.map(o => <option key={o.id} value={o.id}>{o.name} ({o.type})</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Destination (To)</label>
                       <select className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-orange-500">
                          {org?.outlets?.map(o => <option key={o.id} value={o.id}>{o.name} ({o.type})</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Items to Transfer</h4>
                       <button className="text-orange-600 font-black text-[10px] uppercase">+ Add Item</button>
                    </div>
                    <div className="p-6 border-2 border-dashed border-gray-100 rounded-3xl flex items-center justify-between group hover:border-orange-500 transition-all cursor-pointer">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-orange-50 group-hover:text-orange-500 transition-all">
                              <Plus size={24} />
                           </div>
                           <span className="font-bold text-slate-400 group-hover:text-slate-600 transition-all">Search and select item from inventory...</span>
                        </div>
                    </div>
                 </div>

                 <div className="pt-6 border-t flex gap-4">
                    <button className="flex-1 py-5 bg-orange-500 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl shadow-orange-100 active:scale-95 transition-all">
                       Confirm Dispatch
                    </button>
                    <button 
                      onClick={() => setIsNewTransferModalOpen(false)}
                      className="px-10 py-5 bg-gray-50 text-gray-400 rounded-[24px] font-black uppercase tracking-widest text-sm"
                    >
                       Cancel
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default StockTransfers;
