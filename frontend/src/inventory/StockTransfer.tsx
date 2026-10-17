import React, { useState } from 'react';
import { useItems, useTransfers, useCreateTransfer } from './hooks/useInventoryApi';

export const StockTransfer: React.FC = () => {
  const { data: items = [] } = useItems();
  const { data: transfers = [] } = useTransfers();
  const createTransfer = useCreateTransfer();

  const [form, setForm] = useState({ from_outlet: '', to_outlet: '', item_id: '', batch: '', qty: 0, remarks: '' });

  const submit = async () => {
    if (!form.from_outlet || !form.to_outlet || !form.item_id || !form.qty) return alert('Missing required fields');
    try {
      await createTransfer.mutateAsync({ ...form, status: 'REQUESTED', created_at: new Date().toISOString() });
      setForm({ from_outlet: '', to_outlet: '', item_id: '', batch: '', qty: 0, remarks: '' });
    } catch (err: any) {
      alert('Transfer failed: ' + (err.message || String(err)));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black">Stock Transfer</h2>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <form className="grid grid-cols-2 gap-3" onSubmit={(e)=>{ e.preventDefault(); submit(); }} aria-label="Stock transfer form">
          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">From Outlet ID</span>
            <input aria-required value={form.from_outlet} onChange={e=>setForm({...form,from_outlet:e.target.value})} placeholder="From Outlet ID" className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </label>

          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">To Outlet ID</span>
            <input aria-required placeholder="To Outlet ID" className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" value={form.to_outlet} onChange={e=>setForm({...form,to_outlet:e.target.value})} />
          </label>

          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">Item</span>
            <select value={form.item_id} onChange={e=>setForm({...form,item_id:e.target.value})} className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">Select item</option>
              {items.map((it:any)=>(<option key={it.id} value={it.id}>{it.name}</option>))}
            </select>
          </label>

          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">Batch (optional)</span>
            <input placeholder="Batch (optional)" className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" value={form.batch} onChange={e=>setForm({...form,batch:e.target.value})} />
          </label>

          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">Quantity</span>
            <input aria-required type="number" placeholder="Qty" className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" value={form.qty} onChange={e=>setForm({...form,qty:Number(e.target.value)})} />
          </label>

          <label className="flex flex-col text-sm">
            <span className="text-slate-600 mb-1">Remarks</span>
            <input placeholder="Remarks" className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-300" value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})} />
          </label>

          <div className="mt-4 flex gap-2 col-span-2">
            <button type="submit" disabled={createTransfer.isPending} className={`px-4 py-2 rounded-xl text-white ${createTransfer.isPending ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {createTransfer.isPending ? 'Creating...' : 'Create Transfer'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <h3 className="font-black mb-3">Recent Transfers</h3>
        {transfers.map((t:any) => (
          <div key={t.id} className="py-2 border-b flex items-center justify-between">
            <div>
              <div className="font-bold">{t.item_id} • {t.qty}</div>
              <div className="text-xs text-slate-400">{t.from_outlet} → {t.to_outlet} • {t.status}</div>
            </div>
            <div className="text-xs text-slate-400">{new Date(t.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockTransfer;
