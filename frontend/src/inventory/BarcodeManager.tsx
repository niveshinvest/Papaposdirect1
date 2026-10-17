import React from 'react';

export const BarcodeManager: React.FC = () => {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black">Barcode Manager</h2>
        <div className="flex gap-2">
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl">Generate Barcode</button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <div className="text-slate-400">Bulk barcode generation, print layouts, and label templates for retail printers.</div>
      </div>
    </div>
  );
};

export default BarcodeManager;
