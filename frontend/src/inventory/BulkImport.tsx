import React, { useState } from 'react';

export const BulkImport: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);

  const onFile = async (f?: File) => {
    if (!f) return;
    setFile(f);
    // lightweight CSV/XLSX parsing placeholder — the backend should validate
    setPreview([]);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Bulk Import</h2>
        <div>
          <a href="/templates/inventory_import_template.xlsx" className="text-indigo-600 font-bold">Download Template</a>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-6">
        <input type="file" accept=".csv,.xlsx" onChange={e=>onFile(e.target.files?.[0])} />
        <div className="mt-4 text-slate-400">Upload the file to preview errors before importing. The import validates SKU, category, unit and supplier dropdowns.</div>
      </div>

      {preview.length>0 && (
        <div className="bg-white border rounded-2xl p-4">Preview table here</div>
      )}
    </div>
  );
};

export default BulkImport;
