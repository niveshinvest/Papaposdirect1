import React from 'react';
import KpiCard from './components/KpiCard';
import { useKpis } from './hooks/useInventoryApi';

export const InventoryDashboard: React.FC = () => {
  const { data: kpis } = useKpis();

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Inventory Dashboard</h1>
          <p className="text-sm text-slate-400">Enterprise inventory insights — real-time, reliable.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Total Inventory Value" value={kpis?.total_value ?? '—'} delta={kpis?.value_delta} />
        <KpiCard title="Total Items" value={kpis?.total_items ?? '—'} delta={kpis?.items_delta} />
        <KpiCard title="Low Stock Items" value={kpis?.low_stock ?? '—'} delta={kpis?.low_delta} />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        <h3 className="font-black text-slate-800">Stock Value Trend</h3>
        <div className="mt-4">
          {/* Chart expects data from backend RPC; keep progressive enhancement */}
          <div className="h-60 flex items-center justify-center text-slate-300">Chart placeholder</div>
        </div>
      </div>
    </div>
  );
};

export default InventoryDashboard;
