import React from 'react'
import WebhooksList from './WebhooksList'

const Webhooks: React.FC = () => {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100">
      <h3 className="text-xl font-black">Webhooks</h3>
      <p className="text-sm text-slate-500">Manage webhook endpoints and delivery logs for your company.</p>
      <div className="mt-6">
        <WebhooksList />
      </div>
    </div>
  )
}

export default Webhooks
