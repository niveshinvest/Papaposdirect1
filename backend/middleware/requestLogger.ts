import { supabaseAdmin } from '../lib/supabaseAdmin'

export default function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now()
    res.on('finish', async () => {
      try {
        const duration = Date.now() - start
        const auth = req.auth || {}
        await supabaseAdmin.from('api_key_request_logs').insert({
          api_key_id: auth.api_key_id || null,
          api_key_mask: auth.api_key_mask || null,
          endpoint: req.originalUrl || req.url,
          method: req.method,
          response_status: res.statusCode,
          response_time_ms: duration,
          created_at: new Date().toISOString(),
          metadata: { ip: req.ip }
        })
      } catch (e:any) {
        console.error('Failed to log api request', e?.message || e)
      }
    })
    next()
  }
}
