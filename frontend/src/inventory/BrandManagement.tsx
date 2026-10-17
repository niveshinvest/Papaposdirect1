import React, { useState } from 'react';
import EntityTable from './components/EntityTable';
import { useBrands, useCreateBrand, useDeleteBrand } from './hooks/useInventoryApi';

export const BrandManagement: React.FC = () => {
  const { data: brands = [], isLoading } = useBrands();
  const createBrand = useCreateBrand();
  const deleteBrand = useDeleteBrand();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const columns = [
    { header: 'Brand', accessorKey: 'name' },
    { header: 'Description', accessorKey: 'description' },
    { header: 'Status', accessorKey: 'status' }
  ];

  const handleSave = async () => {
    if (!form.name) return alert('Brand name required');
    try {
      await createBrand.mutateAsync({ name: form.name, description: form.description, status: 'ACTIVE' });
      setForm({ name: '', description: '' });
      setShow(false);
    } catch (err: any) {
      alert('Failed to create brand: ' + (err.message || String(err)));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete brand?')) return;
    try {
      await deleteBrand.mutateAsync(id);
    } catch (err: any) {
      alert('Delete failed: ' + (err.message || String(err)));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Brands</h2>
        <button onClick={()=>setShow(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">Add Brand</button>
      </div>

      {show && (
        <div className="bg-white p-4 rounded-2xl border">
          <input placeholder="Brand Name" value={form.name} className="p-2 border rounded w-full mb-2" onChange={e=>setForm({...form,name:e.target.value})} />
          <textarea placeholder="Description" value={form.description} className="p-2 border rounded w-full" onChange={e=>setForm({...form,description:e.target.value})} />
          <div className="mt-3 flex gap-2">
            <button onClick={handleSave} className="bg-emerald-600 text-white px-4 py-2 rounded-xl">Save</button>
            <button onClick={()=>setShow(false)} className="px-4 py-2 rounded-xl bg-slate-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-2xl p-4">
        <EntityTable columns={columns} data={isLoading ? [] : brands.map((b:any)=> ({...b, status: b.status||'ACTIVE', actions: b.id }))} />
        <div className="mt-4">
          {brands.map((b:any)=> (
            <div key={b.id} className="flex items-center justify-between py-2 border-b">
              <div>
                <div className="font-bold">{b.name}</div>
                <div className="text-xs text-slate-400">{b.description}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>handleDelete(b.id)} className="text-rose-600 px-3 py-1 rounded-md border border-rose-100 text-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BrandManagement;
