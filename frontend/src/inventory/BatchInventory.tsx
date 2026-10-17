import React from 'react';
import EntityTable from './components/EntityTable';

export const BatchInventory: React.FC = () => {
  const columns = [
    { header: 'Batch', accessorKey: 'batch_number' },
    { header: 'Item', accessorKey: 'item_name' },
    { header: 'Brand', accessorKey: 'brand' },
    { header: 'Source', accessorKey: 'purchase_source' },
    { header: 'Expiry', accessorKey: 'expiry' },
    { header: 'Remaining', accessorKey: 'remaining' },
  ];

  const data: any[] = [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black">Batch Inventory</h2>
        <div className="flex gap-2">
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl">New Batch</button>
        </div>
      </div>
      <div className="bg-white border rounded-2xl p-4">
        <EntityTable columns={columns} data={data} />
      </div>
    </div>
  );
};

export default BatchInventory;
