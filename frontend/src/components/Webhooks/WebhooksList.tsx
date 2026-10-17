import React, { useEffect, useState } from 'react'
import { getTenantAuthHeaders, getSupabase } from '../../services/supabaseService'
import WebhookFormModal from './WebhookFormModal'
import WebhookDrawer from './WebhookDrawer'
import { API_BASE } from "../../services/config"


const EVENTS = [
  'invoice.created','invoice.updated','invoice.cancelled','payment.received','refund.created',
  'inventory.updated','stock.low','stock.out','purchase.created','purchase.received',
  'customer.created','customer.updated','supplier.created','supplier.updated','kot.created',
  'kitchen.status.updated','order.ready','order.served'
]

const WebhooksList: React.FC = () => {
  const [endpoints, setEndpoints] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [detail, setDetail] = useState<any | null>(null)

  useEffect(() => { load(); }, [])

  const load = async () => {
    setLoading(true)
    try {
      const headers = await getTenantAuthHeaders()
      const resp = await fetch(`${API_BASE}/webhooks/admin/endpoints`, { headers })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to load')
      setEndpoints(Array.isArray(data) ? data : [])
    } catch (e:any) {
      console.error('Failed to load webhooks', e)
      setEndpoints([])
    } finally { setLoading(false) }
  }

  const handleCreate = () => { setEditing(null); setShowCreate(true) }

  const handleEdit = (ep: any) => { setEditing(ep); setShowCreate(true) }

  const handleToggle = async (ep: any) => {
    try {
      const client = getSupabase()
      await client.from('webhook_endpoints').update({ is_enabled: !ep.is_enabled }).eq('id', ep.id)
      await load()
    } catch (e:any) { alert(e.message || e) }
  }

  const handleTest = async (id: string) => {
    try {
      const headers = await getTenantAuthHeaders({ 'Content-Type': 'application/json' })
      const resp = await fetch(`${API_BASE}/webhooks/admin/endpoints/${id}/test`, { method: 'POST', headers })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Test failed')
      alert('Test result: ' + JSON.stringify(data))
      await load()
    } catch (e:any) { alert('Test failed: ' + (e.message || e)) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete webhook endpoint?')) return
    try {
      const client = getSupabase()
      await client.from('webhook_endpoints').delete().eq('id', id)
      await load()
    } catch (e:any) { alert(e.message || e) }
  }

  return (
    <div>
      <div className="flex justify-between items-center">
        <div className="font-black text-lg">Endpoints</div>
        <div className="flex gap-3">
          <button onClick={load} className="px-4 py-2 bg-slate-50 rounded">Refresh</button>
          <button onClick={handleCreate} className="px-4 py-2 bg-slate-900 text-white rounded">+ New Endpoint</button>
        </div>
      </div>

      <div className="mt-4">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-slate-500">
              <th>Name</th>
              <th>URL</th>
              <th>Status</th>
              <th>Events</th>
              <th>Last Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="py-6 text-center">Loading…</td></tr>}
            {!loading && endpoints.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">No endpoints</td></tr>}
            {endpoints.map(ep => (
              <tr key={ep.id} className="border-t">
                <td className="py-3 font-bold">{ep.name || ep.url}</td>
                <td className="py-3 text-sm text-slate-600 truncate max-w-[300px]">{ep.url}</td>
                <td className="py-3">{ep.is_enabled ? 'Active' : 'Paused'}</td>
                <td className="py-3 text-sm">{(ep.events || []).join(', ')}</td>
                <td className="py-3">{ep.last_status || '-'}</td>
                <td className="py-3 text-sm">{ep.created_at ? new Date(ep.created_at).toLocaleString() : '-'}</td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setDetail(ep)} className="px-2 py-1 bg-slate-50 rounded">View</button>
                    <button onClick={() => handleEdit(ep)} className="px-2 py-1 bg-indigo-50 rounded">Edit</button>
                    <button onClick={() => handleTest(ep.id)} className="px-2 py-1 bg-emerald-50 rounded">Test</button>
                    <button onClick={() => handleToggle(ep)} className="px-2 py-1 bg-yellow-50 rounded">{ep.is_enabled ? 'Pause' : 'Resume'}</button>
                    <button onClick={() => handleDelete(ep.id)} className="px-2 py-1 bg-rose-50 rounded">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <WebhookFormModal
          events={EVENTS}
          existing={editing}
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}

      {detail && (
        <WebhookDrawer endpoint={detail} onClose={() => setDetail(null)} onUpdated={load} />
      )}
    </div>
  )
}

export default WebhooksList
