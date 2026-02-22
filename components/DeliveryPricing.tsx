
import React, { useState, useEffect } from 'react';
import { 
  Tag, ArrowRight, DollarSign, Loader2, Save, 
  RefreshCcw, AlertCircle, ShoppingBag, TrendingUp, Check
} from 'lucide-react';
import { deliveryService } from '../services/deliveryService';
import { menuService } from '../services/supabaseService';

interface DeliveryPricingProps {
  activeOutletId: string;
  activePartnerId: string;
  partnerName: string;
}

const DeliveryPricing: React.FC<DeliveryPricingProps> = ({ activeOutletId, activePartnerId, partnerName }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    loadPricingData();
  }, [activeOutletId, activePartnerId]);

  const loadPricingData = async () => {
    setLoading(true);
    try {
      // 1. Get all menu items
      const menuItems = await menuService.fetchItems();
      // 2. Get current overrides
      const overrides = await deliveryService.fetchPricingMatrix(activeOutletId, activePartnerId);
      
      const combined = menuItems.map(m => {
        const override = overrides.find((o: any) => o.menu_item_id === m.id);
        return {
          ...m,
          current_override: override?.override_price || null,
          is_active_override: override?.is_active || false
        };
      });
      
      setItems(combined);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePrice = async (itemId: string, newPrice: number) => {
    setSavingId(itemId);
    try {
      await deliveryService.updateOverridePrice({
        outlet_id: activeOutletId,
        partner_id: activePartnerId,
        menu_item_id: itemId,
        price: newPrice
      });
      // Update local state for immediate feedback
      setItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, current_override: newPrice } : item
      ));
    } catch (e) {
      alert("Failed to update delivery price.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[40px] border border-slate-100">
        <Loader2 className="animate-spin text-orange-500 mb-4" size={32} />
        <p className="text-[10px] font-black uppercase text-slate-400">Loading Pricing Engine...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-8 rounded-[40px] text-white flex justify-between items-center shadow-xl">
         <div>
            <h3 className="text-xl font-black flex items-center gap-3">
              <Tag className="text-orange-500" /> {partnerName} Pricing Matrix
            </h3>
            <p className="text-xs font-medium text-slate-400 mt-1">Set item prices specifically for this channel. In-store prices remain untouched.</p>
         </div>
         <button onClick={loadPricingData} className="p-3 bg-white/10 rounded-2xl hover:bg-white/20 transition-all"><RefreshCcw size={20} /></button>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
           <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <tr>
                 <th className="px-8 py-5">Dish Details</th>
                 <th className="px-8 py-5">In-Store Price</th>
                 <th className="px-8 py-5">Override Logic</th>
                 <th className="px-8 py-5 text-right">{partnerName} Listing Price</th>
              </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
              {items.map(item => {
                const markup = item.current_override ? ((item.current_override - item.base_price) / item.base_price * 100).toFixed(0) : '0';
                
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                       <p className="font-black text-slate-900">{item.name}</p>
                       <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">{item.menu_categories?.name}</p>
                    </td>
                    <td className="px-8 py-6">
                       <span className="font-bold text-slate-500">₹{item.base_price}</span>
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-3">
                          <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${item.current_override ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                             {item.current_override ? `+${markup}% Markup` : 'Direct Fallback'}
                          </div>
                          {item.current_override && <TrendingUp size={14} className="text-emerald-500" />}
                       </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <div className="flex items-center justify-end gap-3">
                          <div className="relative">
                             <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                             <input 
                               type="number"
                               className="w-32 pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-sm text-right focus:ring-2 focus:ring-orange-500 transition-all outline-none"
                               defaultValue={item.current_override || item.base_price}
                               onBlur={(e) => {
                                 const val = parseFloat(e.target.value);
                                 if (val !== item.current_override) handleUpdatePrice(item.id, val);
                               }}
                             />
                          </div>
                          <div className="w-10 flex justify-center">
                            {savingId === item.id ? <Loader2 className="animate-spin text-orange-500" size={18} /> : <Check className="text-slate-200 group-hover:text-emerald-500" size={18} />}
                          </div>
                       </div>
                    </td>
                  </tr>
                );
              })}
           </tbody>
        </table>
      </div>

      <div className="p-8 bg-amber-50 rounded-[40px] border border-amber-100 flex items-start gap-4">
         <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl shrink-0"><AlertCircle size={24} /></div>
         <div>
            <h4 className="font-black text-amber-900 text-sm uppercase tracking-tight">Commission Buffer Warning</h4>
            <p className="text-xs font-medium text-amber-700 mt-1 leading-relaxed">
              Standard marketplace commissions range from 18% to 25%. We recommend setting a delivery markup of at least 20% to maintain your current net margins. 
              Changes here will be synced to {partnerName} on the next catalog refresh.
            </p>
         </div>
      </div>
    </div>
  );
};

export default DeliveryPricing;
