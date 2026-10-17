import React, { useMemo, useState } from 'react';
import { useStockBatches, useItems, useTransfers } from './hooks/useInventoryApi';

export const Reports: React.FC = () => {
  const { data: batches = [] } = useStockBatches();
  const { data: items = [] } = useItems();
  const { data: transfers = [] } = useTransfers();

  const totalStock = useMemo(() => batches.reduce((s:any,b:any)=>s + (b.qty||0), 0), [batches]);
  const topItems = useMemo(() => {
    const map:any = {};
    batches.forEach((b:any)=>{ map[b.item_id] = (map[b.item_id]||0) + (b.qty||0) });
    return Object.entries(map).map(([id,qty])=>({ id, qty })).sort((a:any,b:any)=>b.qty-a.qty).slice(0,10);
  }, [batches]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black">Inventory Reports</h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Total Stock</div>
          <div className="text-3xl font-bold">{totalStock}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Unique Items</div>
          <div className="text-3xl font-bold">{new Set(batches.map((b:any)=>b.item_id)).size}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Transfers (recent)</div>
          <div className="text-3xl font-bold">{transfers.length}</div>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <h3 className="font-black mb-3">Top Items by Stock</h3>
        {topItems.map((t:any)=>{
          const meta = items.find((i:any)=>i.id===t.id) || {};
          return (
            <div key={t.id} className="py-2 border-b flex items-center justify-between">
              <div>{meta.name || t.id}</div>
              <div className="font-bold">{t.qty}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Reports;
