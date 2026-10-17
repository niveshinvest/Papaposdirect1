import React from 'react';

export const LowStockAlerts: React.FC = () => {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black">Low Stock Alerts</h2>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <div className="text-slate-400">Shows low stock, out of stock, fast moving, dead stock with priority badges and reorder suggestions.</div>
      </div>
    </div>
  );
};

export default LowStockAlerts;
