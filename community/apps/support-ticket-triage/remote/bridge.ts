import type { XpertViewQuery } from '@xpert-ai/contracts'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { i18n } from './i18n'

const channel = 'xpertai.remote_component'
const protocolVersion = 1
type Data = Record<string, unknown>
type Pending = { resolve: (value: unknown) => void; reject: () => void; timeout: number }
const pending = new Map<string, Pending>()
let instanceId: string | undefined
let debug = false

export function object(value: unknown): Data {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
}

function send(type: string, body: Data = {}) {
  window.parent.postMessage({ ...body, type, channel, protocolVersion, instanceId }, '*')
}

export function request(type: 'requestData' | 'executeAction' | 'invokeClientCommand', body: Data) {
  if (!instanceId) return Promise.reject(new Error('not_ready'))
  const requestId = crypto.randomUUID()
  return new Promise<unknown>((resolve, reject) => {
    const fail = () => reject(new Error('host_request_failed'))
    const timeout = window.setTimeout(() => {
      pending.delete(requestId)
      fail()
    }, 20000)
    pending.set(requestId, { resolve, reject: fail, timeout })
    send(type, { ...body, requestId })
  })
}

export function startBridge(onInit: (query: XpertViewQuery) => void, onDraft: () => void) {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const m = object(event.data)
    if (m.channel !== channel || m.protocolVersion !== protocolVersion || typeof m.instanceId !== 'string') return
    if (m.type === 'init') {
      const initial = instanceId !== m.instanceId
      if (initial) {
        for (const entry of pending.values()) {
          window.clearTimeout(entry.timeout)
          entry.reject()
        }
        pending.clear()
      }
      instanceId = m.instanceId
      debug = object(m.debug).enabled === true
      const density = object(m.theme).density
      installShadcnThemeVars({ density: density === 'compact' ? 'compact' : 'default' })
      i18n.setLocale(typeof m.locale === 'string' ? m.locale : undefined)
      if (initial) {
        send('resize', { height: 620, viewportBound: true })
        const query = object(m.initialQuery)
        onInit({
          ...(typeof query.page === 'number' ? { page: query.page } : {}),
          ...(typeof query.selectionId === 'string' ? { selectionId: query.selectionId } : {})
        })
      }
      return
    }
    if (m.instanceId !== instanceId) return
    if (m.type === 'hostEvent') {
      if (debug) console.debug('[ticket-triage] draft event')
      onDraft()
      return
    }
    if (typeof m.requestId !== 'string') return
    const entry = pending.get(m.requestId)
    if (!entry) return
    pending.delete(m.requestId)
    window.clearTimeout(entry.timeout)
    if (m.type === 'error') entry.reject()
    else entry.resolve(m.type === 'data' ? m.data : m.result)
  })
  send('ready')
}
