import React, { useEffect, useState } from 'react'
import { getTenantAuthHeaders, getSupabase } from '../../services/supabaseService'

function randomSecret() {
  return Array.from(cryptoRandom(24)).map(b => b.toString(16).padStart(2,'0')).join('')
}

function cryptoRandom(len: number) {
  if (typeof window !== 'undefined' && (window.crypto || (window as any).msCrypto)) {
    const c = (window.crypto || (window as any).msCrypto)
    const arr = new Uint8Array(len)
    c.getRandomValues(arr)
    return arr
  }
  const arr = new Uint8Array(len)
  for (let i=0;i<len;i++) arr[i] = Math.floor(Math.random()*256)
  return arr
}

const WebhookFormModal: React.FC<{ events: string[]; existing?: any; onClose: ()=>void; onSaved?: ()=>void }> = ({ events, existing, onClose, onSaved }) => {
  const [name, setName] = useState(existing?.name || '')
  const [url, setUrl] = useState(existing?.url || '')
  const [selected, setSelected] = useState<string[]>(existing?.events || [])
  const [enabled, setEnabled] = useState(existing?.is_enabled ?? true)
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)

  useEffect(()=>{ if (existing) { setName(existing.name||''); setUrl(existing.url||''); setSelected(existing.events||[]); setEnabled(existing.is_enabled !== false); setNotes(existing.notes||'') } }, [existing])

  const toggleEvent = (ev: string) => {
    setSelected(prev => prev.includes(ev) ? prev.filter(x=>x!==ev) : [...prev, ev])
  }

  const handleSubmit = async (e?: any) => {
    e?.preventDefault()
    if (!url || selected.length===0) return alert('URL and at least one event required')
    setSaving(true)
    try {
      const secret = existing?.secret || randomSecret()
      const body = { url, events: selected, secret, name: name || null, enabled, notes: notes || null }
      const headers = await getTenantAuthHeaders({ 'Content-Type': 'application/json' })
      if (existing?.id) {
        // update via central API
        const client = getSupabase()
        await client.from('webhook_endpoints').update({ url, events: selected, secret, name: name || null, is_enabled: enabled, notes: notes || null }).eq('id', existing.id)
        onSaved && onSaved()
      } else {
        const resp = await fetch('/webhooks/admin/endpoints', { method: 'POST', headers, body: JSON.stringify({ url, events: selected, secret, name: name || null, enabled }) })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data?.error || 'Failed to create')
        // show secret to user once
        setCreatedSecret(secret)
        onSaved && onSaved()
      }
    } catch (e:any) {
      alert(e.message || e)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-900/80">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl">
        <div className="flex justify-between items-center">
          <h3 className="font-black text-lg">{existing ? 'Edit' : 'Create'} Webhook</h3>
          <button onClick={onClose} className="p-2">Close</button>
        </div>

        {!createdSecret && (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-black uppercase">Name</label>
            <input value={name} onChange={e=>setName(e.target.value)} className="w-full px-4 py-2 rounded border" placeholder="Display name" />
          </div>
          <div>
            <label className="text-xs font-black uppercase">Webhook URL</label>
            <input value={url} onChange={e=>setUrl(e.target.value)} className="w-full px-4 py-2 rounded border" placeholder="https://example.com/webhook" />
          </div>
          <div>
            <label className="text-xs font-black uppercase">Events</label>
            <div className="grid grid-cols-3 gap-2 mt-2 max-h-40 overflow-auto">
              {events.map(ev => (
                <label key={ev} className={`p-2 border rounded cursor-pointer ${selected.includes(ev) ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>
                  <input type="checkbox" checked={selected.includes(ev)} onChange={() => toggleEvent(ev)} className="mr-2" /> {ev}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} /> Enable</label>
          </div>
          <div>
            <label className="text-xs font-black uppercase">Notes (optional)</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} className="w-full px-4 py-2 rounded border" rows={3}></textarea>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 rounded">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-slate-900 text-white rounded">{existing ? 'Save' : 'Create'}</button>
          </div>
        </form>
        )}

        {createdSecret && (
          <div className="mt-6 bg-slate-50 p-4 rounded">
            <div className="font-black">Webhook Secret (store this now)</div>
            <div className="mt-2 font-mono break-words">{createdSecret}</div>
            <div className="text-sm text-slate-500 mt-2">This secret will not be shown again. Store it securely.</div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { navigator.clipboard.writeText(createdSecret); alert('Copied') }} className="px-4 py-2 bg-indigo-600 text-white rounded">Copy</button>
              <button onClick={() => { setCreatedSecret(null); onClose(); }} className="px-4 py-2 bg-slate-100 rounded">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WebhookFormModal
