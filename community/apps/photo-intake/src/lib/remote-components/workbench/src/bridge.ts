import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'

// Message protocol of the Xpert View Host. Shape follows the bridges in
// community/apps/dockyard and community/apps/material-identity-governance.
const CHANNEL = 'xpertai.remote_component'
const PROTOCOL_VERSION = 1
const REQUEST_TIMEOUT_MS = 30000
const VIEW_HEIGHT = 720

interface Theme {
  mode?: 'light' | 'dark'
  density?: 'default' | 'compact'
  tokens?: Record<string, string>
}

export interface HostInit {
  locale?: string
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue | undefined }
type HostMessage = Record<string, unknown> & { type: string }
interface Pending {
  resolve: (message: HostMessage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let instanceId: string | null = null
let sequence = 0
const pending = new Map<string, Pending>()

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHostMessage(value: unknown): value is HostMessage {
  return isRecord(value)
    && value.channel === CHANNEL
    && value.protocolVersion === PROTOCOL_VERSION
    && typeof value.type === 'string'
}

function applyTheme(value: unknown) {
  if (!isRecord(value)) return
  const theme: Theme = value
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
  for (const [key, token] of Object.entries(isRecord(theme.tokens) ? theme.tokens : {})) {
    if (typeof token !== 'string') continue
    const name = key.startsWith('--xui-') ? key : `--xui-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`
    document.documentElement.style.setProperty(name, token)
  }
  installShadcnThemeVars({ density: theme.density === 'compact' ? 'compact' : 'default' })
}

function post(message: Record<string, JsonValue | undefined>) {
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: PROTOCOL_VERSION, ...message }, '*')
}

/** Connects to the host. Returns a function that disconnects and rejects open requests. */
export function startBridge(onInit: (init: HostInit) => void, onHostEvent: () => void) {
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent || !isHostMessage(event.data)) return
    const message = event.data
    if (message.type === 'init' && typeof message.instanceId === 'string') {
      instanceId = message.instanceId
      applyTheme(message.theme)
      post({ instanceId, type: 'resize', height: VIEW_HEIGHT, viewportBound: true })
      onInit({ locale: typeof message.locale === 'string' ? message.locale : undefined })
      return
    }
    if (!instanceId || message.instanceId !== instanceId) return
    if (message.type === 'theme' || message.type === 'themeChanged') {
      applyTheme(message.theme)
      return
    }
    if (message.type === 'hostEvent') {
      onHostEvent()
      return
    }
    const requestId = typeof message.requestId === 'string' ? message.requestId : null
    const waiting = requestId ? pending.get(requestId) : undefined
    if (!requestId || !waiting) return
    pending.delete(requestId)
    clearTimeout(waiting.timer)
    if (message.type === 'error') waiting.reject(new Error('host_request_failed'))
    else waiting.resolve(message)
  }
  window.addEventListener('message', onMessage)
  post({ type: 'ready' })
  return () => {
    window.removeEventListener('message', onMessage)
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error('view_closed'))
    }
    pending.clear()
    instanceId = null
  }
}

function request(type: string, body: Record<string, JsonValue | undefined>) {
  if (!instanceId) return Promise.reject(new Error('not_connected'))
  const requestId = String(++sequence)
  return new Promise<HostMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('host_timeout'))
    }, REQUEST_TIMEOUT_MS)
    pending.set(requestId, { resolve, reject, timer })
    post({ instanceId, requestId, type, ...body })
  })
}

/** Loads the view data. The caller validates the shape of the returned item. */
export async function requestData(parameters: Record<string, string> = {}): Promise<unknown> {
  const response = await request('requestData', { query: { parameters } })
  if (response.type !== 'data' || !isRecord(response.data)) throw new Error('unexpected_response')
  return response.data.item
}

/** Runs a view action. Rejects with the server's error code when the action fails. */
export async function executeAction(actionKey: string, input: { [key: string]: JsonValue | undefined }): Promise<unknown> {
  const response = await request('executeAction', { actionKey, input })
  if (response.type !== 'actionResult' || !isRecord(response.result)) throw new Error('unexpected_response')
  const result = response.result
  if (result.success !== true) {
    const code = isRecord(result.data) && typeof result.data.code === 'string' ? result.data.code : 'action_failed'
    throw new Error(code)
  }
  return result.data
}

/** Asks the host to run a client command declared in the view manifest. */
export async function invokeClientCommand(commandKey: string, payload: { [key: string]: JsonValue | undefined }) {
  const response = await request('invokeClientCommand', { commandKey, payload })
  if (response.type !== 'clientCommandResult' || !isRecord(response.result) || response.result.success !== true) {
    throw new Error('client_command_failed')
  }
}
