import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../services/supabaseService';

const client = getSupabase();

export const AIInsightsPanel: React.FC = () => {
  const { data } = useQuery({
    queryKey: ['ai', 'inventoryInsights'],
    queryFn: async () => {
      const { data } = await client.rpc('get_ai_inventory_insights');
      return data || {};
    },
  });

  return (
    <div className="p-6">
      <h2 className="text-2xl font-black mb-4">AI Inventory Insights</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-2xl p-4">
          <h4 className="font-black">Fast Moving</h4>
          <div className="mt-2 text-slate-500">{(data?.fast_moving || []).slice(0,3).map((i:any)=> <div key={i.item_id}>{i.name}</div>)}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <h4 className="font-black">Dead Stock</h4>
          <div className="mt-2 text-slate-500">{(data?.dead_stock || []).slice(0,3).map((i:any)=> <div key={i.item_id}>{i.name}</div>)}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <h4 className="font-black">Reorder Suggestions</h4>
          <div className="mt-2 text-slate-500">{(data?.reorder || []).slice(0,3).map((i:any)=> <div key={i.item_id}>{i.name}</div>)}</div>
        </div>
      </div>
    </div>
  );
};

export default AIInsightsPanel;
