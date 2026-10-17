import React, { useState } from 'react';
import { useItems, useStockAdjustments, useCreateAdjustment } from './hooks/useInventoryApi';

export const StockAdjustment: React.FC = () => {
  const { data: items = [] } = useItems();
  const { data: adjustments = [] } = useStockAdjustments();
  const createAdjustment = useCreateAdjustment();

  const [form, setForm] = useState({ outlet_id: '', item_id: '', qty: 0, type: 'REMOVE', reason: '' });

  const submit = async () => {
    if (!form.outlet_id || !form.item_id || !form.qty) return alert('Missing required fields');
    try {
      await createAdjustment.mutateAsync({ ...form, created_at: new Date().toISOString() });
      setForm({ outlet_id: '', item_id: '', qty: 0, type: 'REMOVE', reason: '' });
    } catch (err: any) {
      alert('Adjustment failed: ' + (err.message || String(err)));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black">Stock Adjustments</h2>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <form className="grid grid-cols-2 gap-3" onSubmit={(e)=>{e.preventDefault(); submit();}} aria-label="Stock adjustment form">
          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">Outlet ID</span>
            <input aria-required value={form.outlet_id} onChange={e=>setForm({...form,outlet_id:e.target.value})} placeholder="Outlet ID" className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </label>

          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">Item</span>
            <select aria-required value={form.item_id} onChange={e=>setForm({...form,item_id:e.target.value})} className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">Select item</option>
              {items.map((it:any)=>(<option key={it.id} value={it.id}>{it.name}</option>))}
            </select>
          </label>

          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">Quantity</span>
            <input aria-required type="number" placeholder="Quantity" className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" value={form.qty} onChange={e=>setForm({...form,qty: Number(e.target.value)})} />
          </label>

          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">Type</span>
            <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="REMOVE">Remove</option>
              <option value="ADD">Add</option>
            </select>
          </label>

          <label className="flex flex-col text-sm col-span-2">
            <span className="text-slate-600 mb-1">Reason</span>
            <input placeholder="Reason" className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} />
          </label>

          <div className="mt-4 flex gap-2 col-span-2">
            <button type="submit" disabled={createAdjustment.isPending} className={`px-4 py-2 rounded-xl text-white ${createAdjustment.isPending ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {createAdjustment.isPending ? 'Applying...' : 'Apply Adjustment'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <h3 className="font-black mb-3">Recent Adjustments</h3>
        {adjustments.map((a:any)=>(
          <div key={a.id} className="py-2 border-b">
            <div className="font-bold">{a.item_id} • {a.qty} ({a.type})</div>
            <div className="text-xs text-slate-400">{a.outlet_id} • {a.reason} • {new Date(a.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockAdjustment;
