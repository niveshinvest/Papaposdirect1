import React, { useEffect, useState } from 'react'
import { getTenantAuthHeaders, getSupabase } from '../../services/supabaseService'

const WebhookDrawer: React.FC<{ endpoint: any; onClose: ()=>void; onUpdated?: ()=>void }> = ({ endpoint, onClose, onUpdated }) => {
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadDeliveries() }, [endpoint])

  const loadDeliveries = async () => {
    setLoading(true)
    try {
      const client = getSupabase()
      const { data, error } = await client.from('webhook_deliveries').select('*').eq('webhook_endpoint_id', endpoint.id).order('delivered_at', { ascending: false }).limit(50)
      if (error) console.error('Failed to load deliveries', error)
      setDeliveries(data || [])
    } catch (e:any) { console.error(e) } finally { setLoading(false) }
  }

  const handleRetry = async (delivery: any) => {
    if (!confirm('Retry this delivery?')) return
    try {
      const client = getSupabase()
      await client.from('sync_failures').insert({ webhook_endpoint_id: endpoint.id, event: delivery.event, payload: JSON.parse(delivery.response_body || '{}'), last_error: delivery.response_body, attempts: 0, next_attempt_at: new Date().toISOString() })
      alert('Queued for retry')
    } catch (e:any) { alert(e.message || e) }
  }

  return (
    <div className="fixed inset-0 z-[700] flex">
      <div className="w-96 bg-white p-6 border-l shadow-xl overflow-auto">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-black">{endpoint.name || endpoint.url}</h3>
            <div className="text-xs text-slate-500">{endpoint.url}</div>
          </div>
          <button onClick={onClose} className="p-2">Close</button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="text-[11px] text-slate-500 uppercase font-black">Events</div>
            <div className="mt-2 text-sm">{(endpoint.events || []).join(', ')}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 uppercase font-black">Secret</div>
            <div className="mt-2 text-sm">{endpoint.secret ? '••••••••••' : '—'}</div>
            <div className="text-xs text-slate-400 mt-1">Shown only on creation. Use copy on create.</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 uppercase font-black">Delivery History</div>
            {loading && <div className="py-4">Loading…</div>}
            {!loading && deliveries.length === 0 && <div className="py-4 text-slate-400">No deliveries yet</div>}
            {!loading && deliveries.map(d => (
              <div key={d.id} className="p-2 border rounded mt-2">
                <div className="flex justify-between items-center">
                  <div className="font-bold text-sm">{d.event}</div>
                  <div className="text-xs">{d.status}</div>
                </div>
                <div className="text-xs text-slate-500 mt-1">{d.delivered_at ? new Date(d.delivered_at).toLocaleString() : ''}</div>
                <div className="mt-2 text-xs text-slate-600 max-h-24 overflow-auto font-mono break-words">{d.response_body}</div>
                <div className="flex justify-end mt-2">
                  <button onClick={() => handleRetry(d)} className="px-2 py-1 bg-amber-50 rounded text-xs">Retry</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1" onClick={onClose} />
    </div>
  )
}

export default WebhookDrawer
