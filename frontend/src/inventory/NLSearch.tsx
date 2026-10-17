import React, { useState } from 'react';
import { getSupabase } from '../services/supabaseService';

const client = getSupabase();

export const NLSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await client.rpc('ai_inventory_nl_query', { p_query: query });
      setResults(data || []);
    } finally { setLoading(false); }
  };

  return (
    <div className="p-6">
      <h3 className="text-xl font-black mb-2">Inventory Assistant</h3>
      <div className="flex gap-3">
        <input value={query} onChange={e=>setQuery(e.target.value)} className="p-2 border rounded flex-1" placeholder="Ask: Show low stock" />
        <button onClick={run} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">Ask</button>
      </div>
      <div className="mt-4 bg-white border rounded-2xl p-4">
        {loading ? <div className="text-slate-400">Thinking...</div> : (
          <div>
            {results.map((r:any, idx:number)=>(<div key={idx} className="py-2 border-b text-slate-700">{r.text || JSON.stringify(r)}</div>))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NLSearch;
