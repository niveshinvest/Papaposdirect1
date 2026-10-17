import React, { useMemo, useState } from 'react';
import { useStockBatches } from './hooks/useInventoryApi';

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (rows: any[], filename: string) => {
  const headers = ['item', 'batch', 'qty', 'expires_at'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => [
      row.item_name || row.item_id,
      row.batch,
      row.qty,
      row.expires_at ? new Date(row.expires_at).toLocaleDateString() : '',
    ].map(csvEscape).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const ExpiryTracking: React.FC = () => {
  const { data: batches = [] } = useStockBatches();
  const [showExpiredOnly, setShowExpiredOnly] = useState(false);

  const rows = useMemo(() => {
    const now = Date.now();
    return batches
      .map((b:any) => ({ ...b, expires_at_ts: b.expires_at ? new Date(b.expires_at).getTime() : null }))
      .filter((b:any) => !showExpiredOnly || (b.expires_at_ts && b.expires_at_ts < now))
      .sort((a:any,b:any) => (a.expires_at_ts||Infinity) - (b.expires_at_ts||Infinity));
  }, [batches, showExpiredOnly]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black">Expiry Tracking</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2"><input aria-label="Show expired only" type="checkbox" checked={showExpiredOnly} onChange={e=>setShowExpiredOnly(e.target.checked)} /> Show expired only</label>
          <button type="button" onClick={() => downloadCsv(rows, `expiry-batches-${Date.now()}.csv`)} className="text-sm text-indigo-600">Export CSV</button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <div className="grid grid-cols-4 gap-3 font-bold text-sm mb-2">
          <div>Item</div>
          <div>Batch</div>
          <div>Qty</div>
          <div>Expires</div>
        </div>
        {rows.map((r:any)=>(
          <div key={r.id} className="grid grid-cols-4 gap-3 py-2 border-b items-center">
            <div>{r.item_name || r.item_id}</div>
            <div>{r.batch}</div>
            <div>{r.qty}</div>
            <div className={`${r.expires_at_ts && r.expires_at_ts < Date.now() ? 'text-red-600' : 'text-slate-600'}`}>{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpiryTracking;
