import React, { useMemo, useState } from 'react';
import { useItems, useSuppliers, useCreateItem } from './hooks/useInventoryApi';
import EntityTable from './components/EntityTable';
import { ColumnDef } from '@tanstack/react-table';

export const ItemMaster: React.FC = () => {
  const { data: items = [] } = useItems();
  const { data: suppliers = [] } = useSuppliers();
  const createItem = useCreateItem();

  const columns = useMemo<ColumnDef<any, any>[]>(() => [
    { header: 'Name', accessorKey: 'name' },
    { header: 'SKU', accessorKey: 'sku' },
    { header: 'Barcode', accessorKey: 'barcode' },
    { header: 'Unit', accessorKey: 'unit' },
    { header: 'Min Stock', accessorKey: 'min_stock' },
    { header: 'Default Supplier', accessorKey: 'default_supplier' },
    { header: 'Status', accessorKey: 'status' },
  ], []);

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({});

  const submit = async () => {
    await createItem.mutateAsync(form);
    setShowNew(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Item Master</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowNew(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold">Add Item</button>
        </div>
      </div>

      {showNew && (
        <div className="bg-white border p-4 rounded-2xl">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Item Name" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} className="p-2 border rounded" />
            <input placeholder="SKU" value={form.sku||''} onChange={e=>setForm({...form,sku:e.target.value})} className="p-2 border rounded" />
            <input placeholder="Barcode" value={form.barcode||''} onChange={e=>setForm({...form,barcode:e.target.value})} className="p-2 border rounded" />
            <select value={form.default_supplier||''} onChange={e=>setForm({...form,default_supplier:e.target.value})} className="p-2 border rounded">
              <option value="">Default Supplier</option>
              {suppliers.map((s:any)=> <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={submit} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold">Save</button>
            <button onClick={()=>setShowNew(false)} className="bg-slate-100 px-4 py-2 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-2xl p-4">
        <EntityTable columns={columns} data={items} />
      </div>
    </div>
  );
};

export default ItemMaster;
