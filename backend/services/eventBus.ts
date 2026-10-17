type EventPayload = {
  event: string
  module: string
  company_id?: string
  outlet_id?: string
  resource_id?: string
  timestamp?: string
  payload?: any
  version?: string
}

type Handler = (ev: EventPayload) => Promise<void> | void

const handlers: Record<string, Handler[]> = {}

export function on(event: string, handler: Handler) {
  handlers[event] = handlers[event] || []
  handlers[event].push(handler)
}

export async function publish(ev: EventPayload) {
  const wildcardHandlers = handlers['*'] || []
  const specific = handlers[ev.event] || []
  const all = [...wildcardHandlers, ...specific]
  await Promise.all(all.map((h) => Promise.resolve().then(() => h(ev))))
}

export default { on, publish }
