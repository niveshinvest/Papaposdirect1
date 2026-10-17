import React, { useState } from 'react';
import { useSuppliers } from './hooks/useInventoryApi';
import EntityTable from './components/EntityTable';

export const SupplierManagement: React.FC = () => {
  const { data: suppliers = [] } = useSuppliers();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});

  const columns = [
    { header: 'Name', accessorKey: 'name' },
    { header: 'Phone', accessorKey: 'phone' },
    { header: 'Email', accessorKey: 'email' },
    { header: 'GST', accessorKey: 'gst_number' },
    { header: 'City', accessorKey: 'city' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Suppliers</h2>
        <div>
          <button onClick={()=>setShowForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">Add Supplier</button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-4 rounded-2xl border">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Supplier Name" className="p-2 border rounded" onChange={e=>setForm({...form,name:e.target.value})} />
            <input placeholder="Contact Person" className="p-2 border rounded" onChange={e=>setForm({...form,contact_person:e.target.value})} />
            <input placeholder="Phone" className="p-2 border rounded" onChange={e=>setForm({...form,phone:e.target.value})} />
            <input placeholder="Email" className="p-2 border rounded" onChange={e=>setForm({...form,email:e.target.value})} />
            <input placeholder="GST Number" className="p-2 border rounded" onChange={e=>setForm({...form,gst_number:e.target.value})} />
            <input placeholder="City" className="p-2 border rounded" onChange={e=>setForm({...form,city:e.target.value})} />
          </div>
          <div className="mt-4 flex gap-2">
            <button className="bg-emerald-600 text-white px-4 py-2 rounded-xl">Save</button>
            <button onClick={()=>setShowForm(false)} className="px-4 py-2 rounded-xl bg-slate-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-2xl p-4">
        <EntityTable columns={columns} data={suppliers} />
      </div>
    </div>
  );
};

export default SupplierManagement;
