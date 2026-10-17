import React, { useState } from 'react';
import { useItems, useSuppliers } from './hooks/useInventoryApi';

export const PurchaseEntry: React.FC = () => {
  const { data: items = [] } = useItems();
  const { data: suppliers = [] } = useSuppliers();

  const [rows, setRows] = useState<any[]>([{ id: Date.now(), item: '', qty: 1, cost_price: 0, selling_price: 0, batch: '', expiry: '' }]);

  const addRow = () => setRows(prev => [...prev, { id: Date.now(), item: '', qty: 1, cost_price: 0, selling_price: 0, batch: '', expiry: '' }]);

  const updateRow = (id: number, k: string, v: any) => setRows(prev => prev.map(r=> r.id===id ? {...r,[k]:v} : r));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Purchase Entry</h2>
        <div className="flex gap-2">
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold">Save Draft</button>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold">Commit</button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <div className="grid grid-cols-12 gap-3 items-center font-bold text-xs text-slate-500">
          <div className="col-span-4">Item</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-1 text-right">Free</div>
          <div className="col-span-1 text-right">Damaged</div>
          <div className="col-span-1 text-right">Cost</div>
          <div className="col-span-1 text-right">Sell</div>
          <div className="col-span-2">Batch / Expiry</div>
        </div>

        {rows.map(r => (
          <div key={r.id} className="grid grid-cols-12 gap-3 items-center py-3 border-t">
            <div className="col-span-4">
              <select className="w-full p-2 border rounded" value={r.item} onChange={e=>updateRow(r.id,'item',e.target.value)}>
                <option value="">Select item</option>
                {items.map((it:any)=>(<option key={it.id} value={it.id}>{it.name}</option>))}
              </select>
            </div>
            <div className="col-span-1"><input type="number" className="w-full p-2 border rounded text-right" value={r.qty} onChange={e=>updateRow(r.id,'qty',Number(e.target.value))} /></div>
            <div className="col-span-1"><input type="number" className="w-full p-2 border rounded text-right" value={r.free_qty||0} onChange={e=>updateRow(r.id,'free_qty',Number(e.target.value))} /></div>
            <div className="col-span-1"><input type="number" className="w-full p-2 border rounded text-right" value={r.damaged_qty||0} onChange={e=>updateRow(r.id,'damaged_qty',Number(e.target.value))} /></div>
            <div className="col-span-1"><input type="number" className="w-full p-2 border rounded text-right" value={r.cost_price} onChange={e=>updateRow(r.id,'cost_price',Number(e.target.value))} /></div>
            <div className="col-span-1"><input type="number" className="w-full p-2 border rounded text-right" value={r.selling_price} onChange={e=>updateRow(r.id,'selling_price',Number(e.target.value))} /></div>
            <div className="col-span-2 flex gap-2">
              <input placeholder="Batch" value={r.batch} onChange={e=>updateRow(r.id,'batch',e.target.value)} className="p-2 border rounded flex-1" />
              <input type="date" className="p-2 border rounded" value={r.expiry} onChange={e=>updateRow(r.id,'expiry',e.target.value)} />
            </div>
          </div>
        ))}

        <div className="pt-4">
          <button onClick={addRow} className="px-4 py-2 bg-slate-100 rounded-xl">Add Row</button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseEntry;
