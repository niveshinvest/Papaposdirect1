import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: string;
  icon?: React.ReactNode;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, delta, icon }) => {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-sm font-bold text-emerald-500">{delta}</div>
          <div className="mt-2 text-slate-400">{icon}</div>
        </div>
      </div>
    </div>
  );
};

export default KpiCard;
