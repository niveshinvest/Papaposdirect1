/* Quick test script for API Keys CRUD

Usage: TEST_BEARER_TOKEN=<user_session_token> node test_api_keys.js

*/
const fetch = require('node-fetch')
const API_BASE = process.env.API_BASE || 'http://localhost:10000'
const BEARER = process.env.TEST_BEARER_TOKEN
if (!BEARER) {
  console.error('Require TEST_BEARER_TOKEN env var')
  process.exit(2)
}

async function headers(extra = {}){
  return Object.assign({ Authorization: `Bearer ${BEARER}`, 'Content-Type': 'application/json' }, extra)
}

async function run(){
  console.log('Listing keys...')
  let res = await fetch(`${API_BASE}/api/settings/api-keys`, { headers: await headers() })
  console.log('list status', res.status)
  const list = await res.json()
  console.log('existing:', list.length)

  console.log('Creating key...')
  res = await fetch(`${API_BASE}/api/settings/api-keys`, { method: 'POST', headers: await headers(), body: JSON.stringify({ name: 'test-key', outlet_ids: [], permissions: ['all'], rate_limit: 1000 }) })
  const created = await res.json()
  console.log('create', res.status, created)
  if (!res.ok) process.exit(3)

  const id = created.id

  console.log('Regenerating...')
  res = await fetch(`${API_BASE}/api/settings/api-keys/${id}/regenerate`, { method: 'POST', headers: await headers() })
  console.log('regen', res.status, await res.json())

  console.log('Toggling...')
  res = await fetch(`${API_BASE}/api/settings/api-keys/${id}/toggle`, { method: 'POST', headers: await headers() })
  console.log('toggle', res.status, await res.json())

  console.log('Deleting...')
  res = await fetch(`${API_BASE}/api/settings/api-keys/${id}`, { method: 'DELETE', headers: await headers() })
  console.log('delete', res.status, await res.text())
}

run().catch(e=>{console.error(e);process.exit(1)})
