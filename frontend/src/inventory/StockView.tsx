import React from 'react';
import EntityTable from './components/EntityTable';
import { useStockBatches } from './hooks/useInventoryApi';

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (rows: Record<string, unknown>[], filename: string) => {
  const headers = Object.keys(rows[0] || {});
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const StockView: React.FC = () => {
  const outletId = undefined; // could be wired from props later
  const { data: batches = [], isLoading } = useStockBatches(outletId);

  const columns = [
    { header: 'Item', accessorKey: 'items.name' },
    { header: 'Brand', accessorKey: 'brand_id' },
    { header: 'Batch', accessorKey: 'batch_number' },
    { header: 'Expiry', accessorKey: 'expiry_date' },
    { header: 'Qty Available', accessorKey: 'qty_available' },
    { header: 'Cost Price', accessorKey: 'cost_price' },
    { header: 'Selling Price', accessorKey: 'selling_price' },
    { header: 'Outlet', accessorKey: 'outlet_id' },
  ];

  const csvData = batches.map((b:any) => ({
    item: b.items?.name || b.item_id,
    batch: b.batch_number,
    expiry: b.expiry_date,
    qty: b.qty_available,
    cost: b.cost_price,
    selling: b.selling_price,
    outlet: b.outlet_id
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Stock View</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => downloadCsv(csvData, 'stock_export.csv')} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">Export CSV</button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <EntityTable columns={columns} data={isLoading ? [] : batches} />
      </div>
    </div>
  );
};

export default StockView;
