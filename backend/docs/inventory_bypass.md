Inventory bypass & trusted service usage
======================================

Purpose
-------
When we enforce FIFO consumption at the DB level, direct writes to `invoice_items` are blocked by a trigger
unless a trusted service sets a session-level bypass flag. This document explains how to use the bypass safely.

How it works
------------
- The DB trigger `guard_invoice_item_insert` checks the session setting `papa.bypass_inventory_guard`.
- If set to `true` (or `1`, `on`) the trigger allows the write; otherwise it throws an error.

Server-side usage (Node)
------------------------
Set the flag in the same DB session/transaction before performing privileged writes. Example using `supabase-admin` client:

```
// Set bypass for this session (local to transaction if used with SET LOCAL)
await supabaseAdmin.rpc('exec_sql', { sql: "SELECT set_config('papa.bypass_inventory_guard','true', true);" })

// perform admin write (example)
await supabaseAdmin.from('invoice_items').insert([...])

// Optionally clear or rely on session scope expiry
```

Recommended pattern
-------------------
- Prefer using the server-side RPC `create_invoice_with_inventory` for sales — it applies strict FIFO allocation automatically.
- Use the bypass flag only for trusted migrations, admin imports, or emergency operations and log these actions.

Security
--------
- Only server components with elevated privileges should set this flag.
- Consider wrapping bypass operations in an audit log entry in `audit_logs` for traceability.
