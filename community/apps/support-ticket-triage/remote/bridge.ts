import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import type { AttemptRef, ErrorCode, Ticket } from '../src/contracts'

const channel = 'xpertai.remote_component'
type Theme = { mode?: string; density?: 'default' | 'compact'; tokens?: Record<string, string> }
interface HostMessage {
  channel: string
  protocolVersion: number
  instanceId: string
  type: string
  requestId?: string
  locale?: string
  theme?: Theme
  success?: boolean
  data?: { items?: Ticket[] }
  result?: { success?: boolean; data?: object }
}

let instanceId: string | undefined
const pending = new Map<string, (reply: HostMessage) => void>()

function setTheme(theme?: Theme) {
  if (!theme) return
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
  for (const [name, value] of Object.entries(theme.tokens ?? {})) {
    const token = name.startsWith('--xui-') ? name : '--xui-' + name.replace(/[A-Z]/g, (s) => '-' + s.toLowerCase())
    document.documentElement.style.setProperty(token, value)
  }
  installShadcnThemeVars({ density: theme.density ?? 'default' })
}

export function connect(onInit: (locale?: string) => void) {
  const listener = (event: MessageEvent<HostMessage>) => {
    const message = event.data
    if (event.source !== window.parent || message?.channel !== channel || message.protocolVersion !== 1) return
    if (message.type === 'init') {
      instanceId = message.instanceId
      setTheme(message.theme)
      onInit(message.locale)
    } else if (message.instanceId === instanceId) {
      if (message.type === 'theme' || message.type === 'themeChanged') setTheme(message.theme)
      if (message.requestId) pending.get(message.requestId)?.(message)
    }
  }
  window.addEventListener('message', listener)
  window.parent.postMessage({ channel, protocolVersion: 1, type: 'ready' }, '*')
  return () => window.removeEventListener('message', listener)
}

export class BridgeError extends Error {
  constructor(readonly code: ErrorCode) { super(code) }
}

function request(type: string, body: object = {}) {
  return new Promise<HostMessage>((resolve, reject) => {
    if (!instanceId) {
      reject(new BridgeError('unavailable'))
      return
    }
    const requestId = crypto.randomUUID()
    const finish = () => {
      clearTimeout(timer)
      pending.delete(requestId)
    }
    const timer = window.setTimeout(() => {
      finish()
      reject(new BridgeError('timed_out'))
    }, 20_000)
    pending.set(requestId, (reply) => {
      finish()
      if (reply.type === 'error' || reply.success === false || reply.result?.success === false) {
        const failure = reply.result?.data as { code?: ErrorCode } | undefined
        reject(new BridgeError(failure?.code ?? 'unavailable'))
      } else resolve(reply)
    })
    window.parent.postMessage({ channel, protocolVersion: 1, instanceId, requestId, type, ...body }, '*')
  })
}

export async function listTickets() {
  const reply = await request('requestData', { query: {} })
  if (!Array.isArray(reply.data?.items)) throw new BridgeError('unavailable')
  return reply.data.items
}

export async function runAction<T extends object = object>(actionKey: string, input: object) {
  return (await request('executeAction', { actionKey, input })).result?.data as T | undefined
}

export function sendTriage(attempt: AttemptRef) {
  return request('invokeClientCommand', {
    commandKey: 'assistant.chat.send_message',
    payload: { text: 'TRIAGE ' + attempt.id + ' ' + attempt.attemptId, newThread: true },
  })
}
