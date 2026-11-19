/**
 * 远程组件与宿主平台之间的 postMessage 桥。
 * channel 固定为 'xpertai.remote_component'，请求-响应通过 requestId 配对。
 */

export interface BridgeMessage {
  channel: string
  protocolVersion: number
  instanceId?: string
  type: string
  requestId?: string
  message?: string
  level?: string
  manifest?: unknown
  payload?: unknown
  initialQuery?: Record<string, unknown>
  locale?: string
  theme?: string
  data?: unknown
  result?: unknown
  [key: string]: unknown
}

export interface HostContext {
  manifest: unknown
  payload: unknown
  initialQuery: Record<string, unknown>
  locale?: string
  theme?: string
}

interface PendingRequest {
  resolve: (value: BridgeMessage) => void
  reject: (error: Error) => void
}

interface BridgeHandlers {
  onInit: (context: HostContext) => void
  onHostEvent: () => void
}

const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

let instanceId: string | null = null
let requestSequence = 0
const pending = new Map<string, PendingRequest>()

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function installBridgeListener(handlers: BridgeHandlers) {
  const listener = (event: MessageEvent) => {
    const rawMessage = event.data
    if (!isObject(rawMessage) || rawMessage.channel !== CHANNEL || rawMessage.protocolVersion !== VERSION) return
    const message = rawMessage as unknown as BridgeMessage

    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      handlers.onInit({
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery ?? {},
        locale: message.locale,
        theme: message.theme
      })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.type === 'hostEvent') {
      handlers.onHostEvent()
      return
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : ''
    if (requestId && pending.has(requestId)) {
      const item = pending.get(requestId)
      pending.delete(requestId)
      if (!item) return
      if (message.type === 'error') {
        item.reject(new Error(typeof message.message === 'string' ? message.message : 'Remote request failed'))
      } else {
        item.resolve(message)
      }
    }
  }

  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export function post(type: string, body?: Record<string, unknown>) {
  if (!instanceId && type !== 'ready') return
  window.parent.postMessage(
    {
      channel: CHANNEL,
      protocolVersion: VERSION,
      instanceId,
      type,
      ...(body ?? {})
    },
    '*'
  )
}

function request(type: string, body?: Record<string, unknown>) {
  const requestId = String(++requestSequence)
  return new Promise<BridgeMessage>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    try {
      post(type, { requestId, ...(body ?? {}) })
    } catch (error) {
      pending.delete(requestId)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function requestData(query: Record<string, unknown>) {
  return request('requestData', { query })
}

export function executeAction(
  actionKey: string,
  targetId: string | null,
  input: Record<string, unknown>,
  parameters?: Record<string, unknown>
) {
  return request('executeAction', { actionKey, targetId, input, parameters })
}

/** 让宿主弹 Toast 提示 */
export function notify(message: string, level = 'success') {
  post('notify', { message, level })
}

/** 上报内容高度，宿主调整 iframe 尺寸 */
export function reportResize() {
  const root = document.getElementById('root')
  const shell = root?.firstElementChild as HTMLElement | null
  const height = Math.max(shell?.scrollHeight ?? 0, 480)
  post('resize', { height: Math.ceil(height), viewportBound: false })
}
