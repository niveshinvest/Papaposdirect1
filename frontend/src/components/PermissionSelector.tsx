import React from 'react'
import { PERMISSION_GROUPS } from '../permissions/permissions'

type Props = {
  selectedPermissions: string[]
  onChange: (perms: string[]) => void
}

export default function PermissionSelector({ selectedPermissions, onChange }: Props) {
  const has = (id: string) => selectedPermissions.includes(id)

  const toggle = (id: string) => {
    if (has(id)) onChange(selectedPermissions.filter(p => p !== id))
    else onChange([...selectedPermissions, id])
  }

  const selectAllGroup = (group: any) => {
    const groupIds = group.permissions.map((p: any) => p.id)
    const next = Array.from(new Set([...selectedPermissions, ...groupIds]))
    onChange(next)
  }

  const clearGroup = (group: any) => {
    const groupIds = group.permissions.map((p: any) => p.id)
    onChange(selectedPermissions.filter(p => !groupIds.includes(p)))
  }

  const selectedCount = selectedPermissions.length

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-black">Permissions</div>
        <div className="text-xs text-slate-500">Selected <span className="font-bold">{selectedCount}</span></div>
      </div>

      <div className="space-y-3">
        {PERMISSION_GROUPS.map(group => (
          <div key={group.id} className="p-3 rounded-lg border border-slate-50 bg-slate-50/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-sm font-black">{group.label}</div>
                {group.warning && <div className="text-amber-600 text-xs px-2 py-1 rounded bg-amber-50">⚠ {group.warning}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => selectAllGroup(group)} className="text-xs px-2 py-1 rounded bg-slate-100">Select all</button>
                <button onClick={() => clearGroup(group)} className="text-xs px-2 py-1 rounded bg-white border">Clear</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {group.permissions.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4" />
                  <span className="text-slate-700">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
