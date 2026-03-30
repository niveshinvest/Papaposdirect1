
import React from 'react';
import { Trash2, RotateCcw, X, AlertCircle, Calendar, Package, Receipt, ChefHat, BookOpen } from 'lucide-react';
import { RecycleBinItem } from '../services/db';

interface RecycleBinProps {
  items: RecycleBinItem[];
  onRestore: (item: RecycleBinItem) => Promise<void>;
  onPermanentDelete: (id: string) => Promise<void>;
}

const RecycleBin: React.FC<RecycleBinProps> = ({ items, onRestore, onPermanentDelete }) => {
  const getDaysRemaining = (deletedAt: Date) => {
    const expiry = new Date(deletedAt);
    expiry.setDate(expiry.getDate() + 30);
    const diff = expiry.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 3600 * 24)));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'orders': return <Receipt size={16} />;
      case 'inventory': return <Package size={16} />;
      case 'menu': return <BookOpen size={16} />;
      case 'recipes': return <ChefHat size={16} />;
      default: return <AlertCircle size={16} />;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
             <div className="p-2 bg-red-100 text-red-600 rounded-xl"><Trash2 size={24} /></div>
             Recycle Bin
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Items here are kept for 30 days before permanent deletion.</p>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">Item Details</th>
                <th className="px-8 py-5">Type</th>
                <th className="px-8 py-5">Deleted On</th>
                <th className="px-8 py-5">Auto-Wipe In</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-slate-300">
                    <div className="flex flex-col items-center gap-3 opacity-50">
                       <Trash2 size={48} />
                       <p className="font-black uppercase text-xs tracking-widest">Recycle bin is empty</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const daysLeft = getDaysRemaining(item.deletedAt);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 group transition-colors">
                      <td className="px-8 py-5">
                         <p className="font-bold text-slate-900">{item.data.name || `Order #${item.id.split('-').pop()}`}</p>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.id}</p>
                      </td>
                      <td className="px-8 py-5">
                         <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-600 w-fit">
                            {getTypeIcon(item.type)} {item.type}
                         </div>
                      </td>
                      <td className="px-8 py-5">
                         <p className="text-xs font-bold text-slate-600 flex items-center gap-2">
                            <Calendar size={14} className="text-slate-300" />
                            {new Date(item.deletedAt).toLocaleDateString()}
                         </p>
                      </td>
                      <td className="px-8 py-5">
                         <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                           daysLeft < 5 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                         }`}>
                           {daysLeft} Days
                         </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                         <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => onRestore(item)}
                              className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                              title="Restore Point"
                            >
                               <RotateCcw size={18} />
                            </button>
                            <button 
                              onClick={() => onPermanentDelete(item.id)}
                              className="p-3 bg-red-50 text-red-400 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                              title="Delete Permanently"
                            >
                               <X size={18} />
                            </button>
                         </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {items.length > 0 && (
        <div className="p-8 bg-orange-500 rounded-[40px] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-orange-100">
           <div className="flex items-center gap-4">
              <div className="p-4 bg-white/20 rounded-3xl backdrop-blur-md">
                 <AlertCircle size={28} />
              </div>
              <div>
                 <h4 className="text-xl font-black tracking-tight">Data Retention Policy</h4>
                 <p className="opacity-80 font-medium">Items older than 30 days are automatically purged from the system forever.</p>
              </div>
           </div>
           <button className="px-8 py-4 bg-white text-orange-500 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-all">
              Learn More
           </button>
        </div>
      )}
    </div>
  );
};

export default RecycleBin;
